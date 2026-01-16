import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'

import { cn } from '../../lib/utils'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded border border-black/20 bg-white/70 shadow-sm',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prime-400/60',
      'data-[state=checked]:bg-prime-500 data-[state=checked]:text-white data-[state=checked]:border-prime-500',
      'dark:border-white/20 dark:bg-white/[0.06]',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.02 7.036a1 1 0 0 1-1.416.003l-3.98-3.98a1 1 0 1 1 1.414-1.414l3.272 3.272 6.312-6.33a1 1 0 0 1 1.412-.001Z"
          clipRule="evenodd"
        />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
