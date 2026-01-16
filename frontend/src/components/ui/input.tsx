import * as React from 'react'

import { cn } from '../../lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-lg border border-black/10 bg-white/60 px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prime-400/60',
        'dark:border-white/10 dark:bg-white/[0.06] dark:placeholder:text-slate-500',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
