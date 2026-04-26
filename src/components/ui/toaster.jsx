import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 w-auto sm:w-full sm:max-w-[420px]">
        {toasts.length > 1 && (
          <button 
            onClick={() => dismiss()}
            className="self-end text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-background/80 backdrop-blur-sm border rounded-full px-3 py-1 shadow-sm mb-1"
          >
            Clear All
          </button>
        )}
        {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => dismiss(id)} />
          </Toast>
        );
      })}
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
