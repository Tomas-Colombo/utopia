import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-display text-2xl text-text">Sign in</h1>
        <p className="text-sm text-muted">Enter your credentials to access your tenant.</p>
      </div>
      <LoginForm />
    </div>
  )
}
