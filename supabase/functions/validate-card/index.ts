import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeKey) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { card_number, exp_month, exp_year, amount } = await req.json();

    if (!card_number || !exp_month || !exp_year || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing card details or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create PaymentMethod server-side (raw card data accepted via secret key)
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: card_number,
        exp_month,
        exp_year,
      },
    });

    // Create a PaymentIntent with manual capture (auth-only, no charge)
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method: paymentMethod.id,
      confirm: true,
      capture_method: "manual",
      automatic_payment_methods: { enabled: false },
      payment_method_types: ["card"],
    });

    if (paymentIntent.status === "requires_capture") {
      // Auth succeeded — immediately cancel to release the hold
      await stripe.paymentIntents.cancel(paymentIntent.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Unexpected status
    return new Response(
      JSON.stringify({
        success: false,
        error: "Your card was declined. Please try a different card.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    const message =
      err?.raw?.message || err?.message || "Your card was declined.";

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
