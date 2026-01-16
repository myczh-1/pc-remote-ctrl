import * as React from 'react'

import { cn } from '../../lib/utils'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prime-400/60 disabled:pointer-events-none disabled:opacity-50'

const buttonVariants: Record<string, string> = {
  default: 'bg-prime-500 text-white hover:bg-prime-600',
  outline: 'border border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
  ghost: 'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
  destructive: 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10',
  secondary: 'bg-black/5 text-slate-700 hover:bg-black/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20',
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonBase, buttonVariants[variant], className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export { Button }
