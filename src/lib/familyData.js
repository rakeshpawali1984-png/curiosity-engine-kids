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
  const { data, error } = await supabase
    .from("parents")
    .select("id, parent_pin_hash, parent_pin_salt, parent_pin_set_at")
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
  const redirectTo = window.location.origin;
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
