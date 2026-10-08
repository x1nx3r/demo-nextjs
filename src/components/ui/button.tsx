import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-clip-padding whitespace-nowrap font-bold outline-none select-none transition-all focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground uppercase tracking-[1.2px] hover:brightness-110 active:brightness-95",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[#252525] active:bg-[#272727]",
        outline:
          "border-[color:var(--border-light)] text-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        destructive:
          "bg-destructive/15 text-destructive hover:bg-destructive/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-[13px]",
        xs: "h-6 px-2.5 text-[11px]",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
