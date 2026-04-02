import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Drop Admin Access</p>
        <h1>Sign in to the control room</h1>
        <p className="auth-copy">
          This dashboard can control live rides, dispatch settings, finance, and
          partner operations. Use your admin credentials to continue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
