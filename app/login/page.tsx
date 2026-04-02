import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Drop access</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-copy">
          Admins can operate the whole service here, and partners are routed into
          their own scoped portal after sign in.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
