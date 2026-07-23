import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Inscription" };

export default function SignupPage() {
  return (
    <div className="px-3 py-8 sm:px-5 sm:py-12">
      <AuthForm mode="signup" />
    </div>
  );
}
