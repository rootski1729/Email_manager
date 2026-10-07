"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { AuthProvider } from "@/lib/auth/auth-provider";

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        // Only surface background refetch failures; first-load errors render inline.
        if (query.state.data !== undefined && !(err instanceof ApiError && err.status === 401)) {
          toast.error(errorMessage(err), { id: "background-refetch" });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        toast.error(errorMessage(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        </AuthProvider>
        <Toaster position="bottom-right" closeButton richColors={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
