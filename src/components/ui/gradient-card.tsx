"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg sm:p-8",
  {
    variants: {
      gradient: {
        orange: "bg-gradient-to-br from-orange-100 to-amber-200/50",
        gray: "bg-gradient-to-br from-slate-100 to-slate-200/50",
        purple: "bg-gradient-to-br from-stone-100 to-stone-200/50",
        green: "bg-gradient-to-br from-emerald-100 to-teal-200/50",
      },
    },
    defaultVariants: {
      gradient: "gray",
    },
  },
);

export type GradientCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants> & {
    badgeText: string;
    badgeColor: string;
    title: string;
    description: string;
    imageUrl: string;
    ctaText?: string;
    ctaHref?: string;
  };

const GradientCard = React.forwardRef<HTMLDivElement, GradientCardProps>(
  (
    {
      className,
      gradient,
      badgeText,
      badgeColor,
      title,
      description,
      ctaText,
      ctaHref,
      imageUrl,
      ...props
    },
    ref,
  ) => {
    const reduceMotion = useReducedMotion();

    const cardAnimation = {
      rest: { scale: 1, y: 0 },
      hover: reduceMotion ? { scale: 1, y: 0 } : { scale: 1.03, y: -4 },
    };

    const imageAnimation = {
      rest: { scale: 1, rotate: 0 },
      hover: reduceMotion ? { scale: 1, rotate: 0 } : { scale: 1.1, rotate: 3 },
    };

    return (
      <motion.div
        ref={ref}
        variants={cardAnimation}
        initial="rest"
        whileHover="hover"
        animate="rest"
        className="h-full"
      >
        <div className={cn(cardVariants({ gradient }), className)} {...props}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            src={imageUrl}
            alt=""
            variants={imageAnimation}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="pointer-events-none absolute -right-1/4 -bottom-1/4 w-3/4 object-contain opacity-80 drop-shadow-md dark:opacity-40"
          />

          <div className="relative z-10 flex h-full min-h-[220px] flex-col">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-background/50 px-3 py-1 text-sm font-medium text-foreground/80 backdrop-blur-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: badgeColor }} />
              {badgeText}
            </div>

            <div className="max-w-[58%] flex-grow">
              <h3 className="mb-2 text-xl font-bold text-foreground sm:text-2xl">{title}</h3>
              <p className="text-sm leading-relaxed text-foreground/70 sm:text-base">{description}</p>
            </div>

            {ctaText && ctaHref ? (
              <a
                href={ctaHref}
                className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                {ctaText}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            ) : null}
          </div>
        </div>
      </motion.div>
    );
  },
);
GradientCard.displayName = "GradientCard";

export { GradientCard, cardVariants };
