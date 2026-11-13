import { StudentNav } from "@/components/student-nav";
import { createClient } from "@/lib/supabase/server";

export async function StudentNavServer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <StudentNav email={user?.email} />;
}

export function StudentNavFallback() {
  return <StudentNav email={null} />;
}
