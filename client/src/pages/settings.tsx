import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Key,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  ExternalLink,
} from "lucide-react";

const settingsSchema = z.object({
  appKey: z.string().min(1, "Application Key obbligatorio"),
  username: z.string().min(1, "Username obbligatorio"),
  password: z.string().min(1, "Password obbligatoria"),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface BetfairSettings {
  appKey: string;
  sessionToken: string | null;
  sessionExpiry: string | null;
}

interface ConnectionStatus {
  connected: boolean;
  message: string;
  sessionExpiry?: string;
}

export default function Settings() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showAppKey, setShowAppKey] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<BetfairSettings>({
    queryKey: ["/api/betfair/settings"],
    retry: false,
    staleTime: 60000,
  });

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<ConnectionStatus>({
    queryKey: ["/api/betfair/status"],
    retry: false,
    staleTime: 30000,
  });

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appKey: "",
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (settings?.appKey) {
      form.setValue("appKey", settings.appKey);
    }
  }, [settings, form]);

  const connectMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return apiRequest("POST", "/api/betfair/connect", data);
    },
    onSuccess: () => {
      toast({
        title: "Connessione Riuscita",
        description: "Sei connesso a Betfair Exchange Italy",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/betfair"] });
      form.reset({ appKey: form.getValues("appKey"), username: "", password: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore Connessione",
        description: error.message || "Impossibile connettersi a Betfair",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/betfair/disconnect", {});
    },
    onSuccess: () => {
      toast({
        title: "Disconnesso",
        description: "Sessione Betfair terminata",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/betfair"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    connectMutation.mutate(data);
  };

  const formatExpiry = (expiry: string | null | undefined) => {
    if (!expiry) return "-";
    const date = new Date(expiry);
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">
          Configura la connessione a Betfair Exchange Italy
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                Stato Connessione
              </CardTitle>
              <CardDescription>
                Verifica lo stato della connessione API
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchStatus()}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {status?.connected ? (
                  <>
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Connesso
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Sessione valida fino al {formatExpiry(status.sessionExpiry)}
                    </span>
                  </>
                ) : (
                  <>
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Disconnesso
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {status?.message || "Nessuna sessione attiva"}
                    </span>
                  </>
                )}
              </div>
              
              {status?.connected && (
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="gap-2"
                  data-testid="button-disconnect"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  Disconnetti
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Credenziali Betfair
          </CardTitle>
          <CardDescription>
            Inserisci le tue credenziali per Betfair.it Exchange
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="appKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showAppKey ? "text" : "password"}
                          placeholder="Inserisci la tua App Key"
                          data-testid="input-app-key"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowAppKey(!showAppKey)}
                        >
                          {showAppKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Trova la tua App Key nel{" "}
                      <a
                        href="https://myaccount.betfair.it/s/accountdetails/mysecurity"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1"
                      >
                        portale sviluppatori
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username Betfair</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Il tuo username Betfair.it"
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="La tua password Betfair.it"
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      La password non viene salvata, viene usata solo per il login
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={connectMutation.isPending}
                data-testid="button-connect"
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connessione in corso...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Connetti a Betfair
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Informazioni Importanti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Questa applicazione utilizza l&apos;API ufficiale di Betfair Exchange Italy.
          </p>
          <p>
            <strong>Limiti Italian Exchange:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Stake minimo BACK: &euro;2.00 (incrementi di &euro;0.50)</li>
            <li>Vincita massima per scommessa: &euro;10,000</li>
            <li>Massimo 50 istruzioni per richiesta</li>
          </ul>
          <p>
            Le tue credenziali sono trasmesse in modo sicuro e la password
            non viene mai memorizzata.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
