import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast surface, themed from the app's own theme.
 *
 * It used to read `next-themes`, which this app never installs a provider for,
 * so every toast rendered "system" — the OS theme — and looked wrong for
 * anyone who had used the switch to disagree with their OS.
 */
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme={useTheme()}
    className="toaster group"
    // The surface comes from the tokens (see `.toast` in buttons.css): this
    // was a fixed dark rgba at the mount site, a smudge on the cream page.
    toastOptions={{ className: "toast" }}
    // Bottom-centre, above the editor's status bar. Bottom-right put every
    // toast over the AI panel's queue bar and the status bar's buttons — the
    // controls a toast about an AI job is usually telling you to reach for.
    position="bottom-center"
    offset={40}
    {...props}
  />
);

export { Toaster };
