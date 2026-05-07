import type { DetailsHTMLAttributes, ReactNode } from "react";
import { useRef } from "react";

type DetailsProps = DetailsHTMLAttributes<HTMLDetailsElement> & {
  initialOpen?: boolean;
  children: ReactNode;
};

export function Details({ children, initialOpen = false, ...props }: DetailsProps) {
  const initialized = useRef(false);
  return (
    <details
      {...props}
      ref={el => {
        if (!el || initialized.current) return;
        el.open = initialOpen;
        initialized.current = true;
      }}
    >
      {children}
    </details>
  );
}
