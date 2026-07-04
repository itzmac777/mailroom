import { LoginForm } from "@/components/LoginForm";
import { getPublicConfig } from "@/lib/api";

export default async function LoginPage() {
  const config = await getPublicConfig();
  return (
    <main className="grid min-h-[calc(100vh-118px)] place-items-center bg-white px-5 py-14">
      <LoginForm mailDomain={config.mailDomain} />
    </main>
  );
}
