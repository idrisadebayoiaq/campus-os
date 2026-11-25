import { redirect } from "next/navigation";

/** Legacy /download → landing download section. */
export default function DownloadRedirect() {
  redirect("/#download");
}
