import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { ChatClient } from "@/components/chat-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ChatPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return <ChatClient user={user} />;
}
