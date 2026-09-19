import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — matches the bucket's own file_size_limit (migration 0039)
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * POST /api/account/logo — 19 Sept 2026, Steven: "also need an option to
 * upload a logo for the sellers to put on their accounts page." First real
 * file-upload route in this app (everywhere else, an image is either a
 * static asset or a URL a staff member pastes in — see migration 0039's
 * comment). Uses the user's own session-scoped Supabase client (not the
 * service-role one), so Storage's own RLS policies do the real
 * enforcement — a user literally cannot write outside their own
 * "<profile_id>/" folder in the seller-logos bucket, this route doesn't
 * have to re-check that itself.
 *
 * Body: multipart/form-data with a single "file" field. Always uploads as
 * "<profile_id>/logo.<ext>" with upsert — a re-upload replaces the old
 * logo at the same path rather than accumulating old versions.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Logos must be a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo must be 2MB or smaller." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const path = `${auth.userId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("seller-logos")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = supabase.storage.from("seller-logos").getPublicUrl(path);
  // Cache-bust — same path is reused on every re-upload (upsert), so
  // without this a browser/CDN could keep showing the old cached image
  // after a seller replaces their logo.
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from("profiles").update({ logo_url: logoUrl }).eq("id", auth.userId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ logoUrl });
}

/** DELETE /api/account/logo — remove a previously-uploaded logo. */
export async function DELETE() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  // Try both extensions — cheap and avoids needing to remember which one
  // this seller originally uploaded.
  await supabase.storage.from("seller-logos").remove(
    Object.values(ALLOWED_TYPES).map((ext) => `${auth.userId}/logo.${ext}`),
  );

  const { error } = await supabase.from("profiles").update({ logo_url: null }).eq("id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
