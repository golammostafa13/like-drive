import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The focus ring is offset from the ground rather than drawn on the button, so
  // it stays visible on the solid primary as well as on the transparent ghost.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        /* The one primary. Its shadow is tinted with the primary rather than
           with grey (that glow, not the fill, is what separates it from the
           page), and hover deepens the fill while the glow widens, so the
           lift is lit from the same source. There is deliberately no black
           button variant: a near-black pill reads as heavy and dated, and a
           second solid variant is a second primary. */
        primary:
          "bg-accent text-accent-ink shadow-glow hover:bg-accent-hover hover:shadow-glow-lg hover:-translate-y-0.5",
        outline:
          "border border-ink/20 bg-transparent text-ink hover:border-accent/50 hover:bg-accent-soft hover:text-accent",
        soft: "bg-surface text-ink shadow-e1 hover:shadow-e2 hover:-translate-y-0.5",
        ghost: "text-ink-mute hover:bg-accent-soft hover:text-accent",
        danger: "bg-danger text-white shadow-e1 hover:brightness-110",
      },
      size: {
        sm: "h-9 px-4 text-sm [&_svg]:size-4",
        md: "h-11 px-6 text-[0.95rem] [&_svg]:size-4",
        lg: "h-14 px-8 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
