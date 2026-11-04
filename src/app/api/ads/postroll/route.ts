import {serveVideoRoll} from "@/lib/ads-video-roll";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  return serveVideoRoll(request,"postroll");
}
