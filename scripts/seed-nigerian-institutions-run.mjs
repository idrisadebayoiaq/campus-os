import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("d:/campus-os/student-website/package.json");
const { createClient: createSupabase } = require("@supabase/supabase-js");

const env = fs.readFileSync("d:/campus-os/.env", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Missing Supabase env");

const supabase = createSupabase(url, key, { auth: { persistSession: false } });

/** Reuse generator data by importing rows from sibling file via eval of exported helper */
const genPath = "d:/campus-os/scripts/generate-nigerian-institutions-seed.mjs";
const gen = fs.readFileSync(genPath, "utf8");
const match = gen.match(/const rows = (\[[\s\S]*?\n\]);/);
if (!match) throw new Error("Could not parse rows from generator");
const rows = Function(`"use strict"; return (${match[1]});`)();

const instMap = new Map();
for (const [name, short_name, type, campus, city, state] of rows) {
  if (!instMap.has(name)) instMap.set(name, { name, short_name, type, campuses: [] });
  const inst = instMap.get(name);
  if (!inst.campuses.some((c) => c.campus === campus)) {
    inst.campuses.push({ campus, city, state });
  }
}

const { data: existing, error: existErr } = await supabase
  .from("institutions")
  .select("id, name");
if (existErr) throw existErr;

const byLower = new Map((existing || []).map((i) => [i.name.toLowerCase(), i.id]));

let createdInstitutions = 0;
let createdCampuses = 0;

for (const inst of instMap.values()) {
  let institutionId = byLower.get(inst.name.toLowerCase());
  if (!institutionId) {
    const { data, error } = await supabase
      .from("institutions")
      .insert({
        name: inst.name,
        short_name: inst.short_name,
        institution_type: inst.type,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) {
      console.error("institution insert failed", inst.name, error.message);
      continue;
    }
    institutionId = data.id;
    byLower.set(inst.name.toLowerCase(), institutionId);
    createdInstitutions += 1;
  }

  const { data: campuses, error: cErr } = await supabase
    .from("campuses")
    .select("id, name")
    .eq("institution_id", institutionId);
  if (cErr) {
    console.error("campus list failed", inst.name, cErr.message);
    continue;
  }
  const campusNames = new Set((campuses || []).map((c) => c.name.toLowerCase()));

  for (const c of inst.campuses) {
    if (campusNames.has(c.campus.toLowerCase())) continue;
    const { error } = await supabase.from("campuses").insert({
      institution_id: institutionId,
      name: c.campus,
      city: c.city,
      state: c.state,
      is_active: true,
    });
    if (error) {
      console.error("campus insert failed", inst.name, c.campus, error.message);
      continue;
    }
    createdCampuses += 1;
  }
}

const { count: instCount } = await supabase
  .from("institutions")
  .select("*", { count: "exact", head: true });
const { count: campusCount } = await supabase
  .from("campuses")
  .select("*", { count: "exact", head: true });

console.log(
  JSON.stringify(
    {
      createdInstitutions,
      createdCampuses,
      totalInstitutions: instCount,
      totalCampuses: campusCount,
    },
    null,
    2,
  ),
);
