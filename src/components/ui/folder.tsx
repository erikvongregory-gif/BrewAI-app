import { cn } from "@/lib/utils";

type FolderProps = {
  className?: string;
  /** Kompakt für Header-Buttons; Standard = Demo-Größe */
  size?: "sm" | "md" | "lg";
  showHint?: boolean;
};

const SIZE: Record<NonNullable<FolderProps["size"]>, string> = {
  sm: "w-[2.15rem] h-[1.45rem]",
  md: "w-40 h-[6.5rem]",
  lg: "w-60 h-40",
};

/**
 * 3D-Folder (Hover öffnet die Blätter).
 * `sm` ist für die Header-Toolbar neben dem Einstellungsrad gedacht.
 */
export function Folder({ className, size = "lg", showHint = size === "lg" }: FolderProps) {
  const compact = size === "sm";

  return (
    <section
      className={cn(
        "relative group flex flex-col items-center justify-center",
        compact ? "h-full w-full" : "h-full w-full",
        className,
      )}
    >
      <div
        className={cn(
          "file relative cursor-pointer origin-bottom [perspective:1500px] z-50",
          SIZE[size],
        )}
      >
        <div
          className={cn(
            "work-5 bg-amber-600 w-full h-full origin-top rounded-xl rounded-tl-none relative",
            "group-hover:shadow-[0_20px_40px_rgba(0,0,0,.2)] transition-all ease duration-300",
            "after:absolute after:content-[''] after:bottom-[99%] after:left-0 after:bg-amber-600 after:rounded-t-xl",
            "before:absolute before:content-[''] before:bg-amber-600 before:[clip-path:polygon(0_35%,0%_100%,50%_100%)]",
            compact
              ? "rounded-md rounded-tl-none after:w-3 after:h-1 before:-top-[3px] before:left-[11px] before:w-1 before:h-1"
              : "after:w-20 after:h-4 before:-top-[15px] before:left-[75.5px] before:w-4 before:h-4",
          )}
        />
        <div
          className={cn(
            "work-4 absolute inset-1 bg-zinc-400 rounded-xl transition-all ease duration-300 origin-bottom select-none",
            "group-hover:[transform:rotateX(-20deg)]",
            compact && "inset-px rounded-md",
          )}
        />
        <div
          className={cn(
            "work-3 absolute inset-1 bg-zinc-300 rounded-xl transition-all ease duration-300 origin-bottom",
            "group-hover:[transform:rotateX(-30deg)]",
            compact && "inset-px rounded-md",
          )}
        />
        <div
          className={cn(
            "work-2 absolute inset-1 bg-zinc-200 rounded-xl transition-all ease duration-300 origin-bottom",
            "group-hover:[transform:rotateX(-38deg)]",
            compact && "inset-px rounded-md",
          )}
        />
        <div
          className={cn(
            "work-1 absolute bottom-0 bg-gradient-to-t from-amber-500 to-amber-400 w-full rounded-xl rounded-tr-none",
            "after:absolute after:content-[''] after:bottom-[99%] after:right-0 after:bg-amber-400 after:rounded-t-xl",
            "before:absolute before:content-[''] before:bg-amber-400 before:[clip-path:polygon(100%_14%,50%_100%,100%_100%)]",
            "transition-all ease duration-300 origin-bottom flex items-end",
            "group-hover:shadow-[inset_0_20px_40px_#fbbf24,_inset_0_-20px_40px_#d97706]",
            "group-hover:[transform:rotateX(-46deg)_translateY(1px)]",
            compact
              ? "h-[90%] rounded-md rounded-tr-none after:w-[70%] after:h-1 before:-top-[2px] before:right-[calc(70%-2px)] before:size-1.5"
              : "h-[156px] after:w-[146px] after:h-[16px] before:-top-[10px] before:right-[142px] before:size-3",
          )}
        />
      </div>
      {showHint ? <p className="pt-4 text-3xl opacity-20">Hover over</p> : null}
    </section>
  );
}

export default Folder;
