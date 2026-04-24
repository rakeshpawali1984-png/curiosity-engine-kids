import { supabase } from "./supabaseClient";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.local");
  }
}

export function toBadgeKey(title) {
  return String(title || "badge")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function upsertParentFromSession(session) {
  requireSupabase();
  const user = session?.user;
  if (!user) throw new Error("No authenticated user");

  const { error } = await supabase
    .from("parents")
    .upsert(
      {
        id: user.id,
        email: user.email,
        display_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Parent",
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

export async function listChildProfiles(parentId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("child_profiles")
    .select("id, parent_id, name, avatar_emoji, age_range, created_at")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getParentSecurity(parentId) {
  requireSupabase();
  // Intentionally excludes parent_pin_hash and parent_pin_salt.
  // Hash comparison is done server-side via /api/verify-pin to prevent client-side brute-force.
  const { data, error } = await supabase
    .from("parents")
    .select("id, parent_pin_set_at")
    .eq("id", parentId)
    .single();

  if (error) throw error;
  return data;
}

export async function setParentPinSecurity(parentId, parentPinHash, parentPinSalt) {
  requireSupabase();
  const { error } = await supabase
    .from("parents")
    .update({
      parent_pin_hash: parentPinHash,
      parent_pin_salt: parentPinSalt,
      parent_pin_set_at: new Date().toISOString(),
    })
    .eq("id", parentId);

  if (error) throw error;
}

export async function createChildProfile(parentId, payload) {
  requireSupabase();
  const { data, error } = await supabase
    .from("child_profiles")
    .insert({
      parent_id: parentId,
      name: payload.name,
      avatar_emoji: payload.avatar_emoji || "🧠",
      age_range: payload.age_range || "6-8",
    })
    .select("id, parent_id, name, avatar_emoji, age_range, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function logChildSearch(childId, queryText, searchType = "curious") {
  requireSupabase();
  const { data, error } = await supabase
    .from("child_searches")
    .insert({ child_id: childId, query_text: queryText, search_type: searchType })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function awardChildBadge(childId, badgeTitle, sourceSearchId = null) {
  requireSupabase();
  const { error } = await supabase
    .from("child_badges")
    .upsert(
      {
        child_id: childId,
        badge_key: toBadgeKey(badgeTitle),
        badge_title: badgeTitle,
        source_search_id: sourceSearchId,
      },
      { onConflict: "child_id,badge_key" }
    );

  if (error) throw error;
}

export async function signInWithGoogle() {
  requireSupabase();
  const configuredRedirect = (import.meta.env.VITE_AUTH_REDIRECT_URL || "").trim();
  const origin = window.location.origin;
  const fallbackRedirect = `${origin}/app`;
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  // Keep explicit redirect URLs, but avoid defaulting back to landing/home.
  let redirectTo = configuredRedirect.replace(/\/+$/, "") || fallbackRedirect;
  if (redirectTo === origin || redirectTo === `${origin}/`) {
    redirectTo = fallbackRedirect;
  }

  // In local development, prefer the current local origin to avoid stale prod/preview env values.
  if (isLocalhost) {
    try {
      const redirectUrl = new URL(redirectTo);
      if (!["localhost", "127.0.0.1"].includes(redirectUrl.hostname)) {
        redirectTo = fallbackRedirect;
      }
    } catch {
      redirectTo = fallbackRedirect;
    }
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function listChildBadges(childId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("child_badges")
    .select("id, badge_key, badge_title, awarded_at")
    .eq("child_id", childId)
    .order("awarded_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listChildSearchHistory(childId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("child_searches")
    .select("id, query_text, search_type, created_at")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

export async function deleteChildHistory(childId) {
  requireSupabase();
  const { error } = await supabase
    .from("child_searches")
    .delete()
    .eq("child_id", childId);

  if (error) throw error;
}

export async function deleteChildProfile(childId) {
  requireSupabase();
  const { error } = await supabase
    .from("child_profiles")
    .delete()
    .eq("id", childId);

  if (error) throw error;
}

async function getAuthHeaders() {
  requireSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Session expired. Please sign in again.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function getBillingStatus() {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/billing/status", {
    method: "GET",
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not load billing status");
  }

  return payload;
}

export async function createCheckoutSession({ returnPath } = {}) {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/billing/create-checkout-session", {
    method: "POST",
    headers,
    body: JSON.stringify({ returnPath }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not start checkout");
  }

  if (!payload?.checkoutUrl) {
    throw new Error("Checkout URL missing");
  }

  return payload;
}

export async function createCustomerPortalSession() {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/billing/customer-portal", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not open billing portal");
  }

  if (!payload?.portalUrl) {
    throw new Error("Billing portal URL missing");
  }

  return payload;
}

export async function getParentDigestSettings() {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/parent-digest-settings", {
    method: "GET",
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not load digest settings");
  }

  return payload;
}

export async function updateParentDigestSettings({ enabled, time, timezone }) {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/parent-digest-settings", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ enabled, time, timezone }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not save digest settings");
  }

  return payload;
}

export async function sendDailySummaryEmailNow() {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/send-daily-summary-email", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Could not send daily summary");
  }

  return payload;
}
