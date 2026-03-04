import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID")!;
const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET")!;
const QBO_BASE_URL = Deno.env.get("QBO_BASE_URL") || "https://sandbox.api.intuit.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- QBO OAuth Token Management ---

interface QboAuth {
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
}

async function getQboAuth(supabase: ReturnType<typeof createClient>): Promise<QboAuth> {
  const { data, error } = await supabase
    .from("qbo_auth_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error("QBO auth config not found. Please seed the qbo_auth_config table.");
  }

  const expiresAt = new Date(data.access_token_expires_at);
  const now = new Date();

  // If token is still valid (with 5 min buffer), return it
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return data as QboAuth;
  }

  // Token expired or about to expire — refresh it
  const basicAuth = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
  const refreshResp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    }),
  });

  if (!refreshResp.ok) {
    const errBody = await refreshResp.text();
    throw new Error(`QBO token refresh failed: ${refreshResp.status} ${errBody}`);
  }

  const tokens = await refreshResp.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Save new tokens (QBO uses rotating refresh tokens — must save the new one)
  const { error: updateError } = await supabase
    .from("qbo_auth_config")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (updateError) {
    throw new Error(`Failed to save refreshed tokens: ${updateError.message}`);
  }

  return {
    realm_id: data.realm_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: newExpiresAt,
  };
}

// --- Main Handler ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const {
      customer_id,
      card_number,
      exp_month,
      exp_year,
      cvc,
      cardholder_name,
      zip,
      pre_auth_amount,
    } = await req.json();

    // Validate required fields (pre_auth_amount is optional)
    if (!customer_id || !card_number || !exp_month || !exp_year || !cvc) {
      return jsonResponse(
        { success: false, error: "Missing required fields" },
      );
    }

    // Create service-role Supabase client for DB access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up QBO customer ID from Customers table
    const { data: customer, error: custError } = await supabase
      .from("Customers")
      .select("qbo_customer_id")
      .eq("id", customer_id)
      .single();

    if (custError || !customer?.qbo_customer_id) {
      return jsonResponse(
        { success: false, error: "Customer not found or missing QBO customer ID" },
      );
    }

    const qboCustomerId = customer.qbo_customer_id;

    // Get (and potentially refresh) QBO OAuth tokens
    const auth = await getQboAuth(supabase);

    const qboHeaders = {
      "Authorization": `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    // Step 1: Save card to QBO customer (full card details required)
    const cardBody: Record<string, unknown> = {
      number: card_number,
      expMonth: exp_month,
      expYear: exp_year,
      cvc: cvc,
    };
    if (cardholder_name) cardBody.name = cardholder_name;
    if (zip) cardBody.address = { postalCode: zip };

    const saveCardResp = await fetch(
      `${QBO_BASE_URL}/quickbooks/v4/customers/${qboCustomerId}/cards`,
      {
        method: "POST",
        headers: { ...qboHeaders, "Request-Id": crypto.randomUUID() },
        body: JSON.stringify(cardBody),
      },
    );

    const saveCardText = await saveCardResp.text();
    if (!saveCardResp.ok) {
      console.error("Save card failed:", saveCardResp.status, saveCardText);
      const parsed = JSON.parse(saveCardText).errors?.[0];
      return jsonResponse(
        { success: false, error: parsed?.message || `Save card failed: ${saveCardResp.status}` },
      );
    }

    const cardData = JSON.parse(saveCardText);
    const qboCardId = cardData.id;
    if (!qboCardId) {
      return jsonResponse(
        { success: false, error: "Card saved but no ID returned" },
      );
    }

    // Step 2: Append "card on file" note to QBO customer
    const lastFour = card_number.replace(/\D/g, "").slice(-4);
    const cardNote = `Card on file ending in ${lastFour} (API only)`;
    try {
      // QBO accounting API base is different from payments API
      const acctBase = QBO_BASE_URL.replace("sandbox.api.intuit.com", "sandbox-quickbooks.api.intuit.com")
        .replace("api.intuit.com", "quickbooks.api.intuit.com");
      const custReadResp = await fetch(
        `${acctBase}/v3/company/${auth.realm_id}/customer/${qboCustomerId}?minorversion=73`,
        { headers: { "Authorization": `Bearer ${auth.access_token}`, "Accept": "application/json" } },
      );
      if (custReadResp.ok) {
        const custJson = await custReadResp.json();
        const existing = custJson.Customer;
        const existingNotes = existing.Notes || "";
        // Only append if this card note isn't already there
        if (!existingNotes.includes(`ending in ${lastFour}`)) {
          const newNotes = existingNotes
            ? `${existingNotes}\n${cardNote}`
            : cardNote;
          const updateBody = {
            Id: existing.Id,
            SyncToken: existing.SyncToken,
            sparse: true,
            Notes: newNotes,
          };
          await fetch(
            `${acctBase}/v3/company/${auth.realm_id}/customer?minorversion=73`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${auth.access_token}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
              },
              body: JSON.stringify(updateBody),
            },
          );
        }
      }
    } catch (noteErr) {
      // Non-fatal — card is saved, just log the note failure
      console.error("Failed to update customer notes:", noteErr);
    }

    // Step 3: Pre-authorize (optional — only if pre_auth_amount provided)
    let qboChargeId: string | undefined;

    if (pre_auth_amount && pre_auth_amount > 0) {
      const amountDollars = (pre_auth_amount / 100).toFixed(2);

      const chargeResp = await fetch(`${QBO_BASE_URL}/quickbooks/v4/payments/charges`, {
        method: "POST",
        headers: { ...qboHeaders, "Request-Id": crypto.randomUUID() },
        body: JSON.stringify({
          amount: amountDollars,
          currency: "USD",
          capture: false,
          cardOnFile: qboCardId,
          context: {
            mobile: false,
            isEcommerce: true,
          },
        }),
      });

      const chargeText = await chargeResp.text();
      if (!chargeResp.ok) {
        console.error("Pre-auth failed:", chargeResp.status, chargeText);
        const parsed = JSON.parse(chargeText).errors?.[0];
        return jsonResponse(
          { success: false, error: parsed?.message || `Pre-auth failed: ${chargeResp.status}` },
        );
      }

      const chargeData = JSON.parse(chargeText);
      qboChargeId = chargeData.id;
      if (!qboChargeId) {
        return jsonResponse(
          { success: false, error: "Card saved but pre-authorization failed" },
        );
      }
    }

    return jsonResponse({
      success: true,
      qboCardId,
      qboChargeId: qboChargeId || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Card validation failed";
    console.error("qbo-card-auth error:", message);
    return jsonResponse({ success: false, error: message });
  }
});
