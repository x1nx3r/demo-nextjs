import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-transparent bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:shadow-input disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
