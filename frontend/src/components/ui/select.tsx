import * as React from 'react'

import { cn } from '../../lib/utils'

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border border-black/10 bg-white/60 px-3 py-1 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prime-400/60',
        'dark:border-white/10 dark:bg-white/[0.06]',
        className
      )}
      {...props}
    />
  )
)
Select.displayName = 'Select'

export { Select }
