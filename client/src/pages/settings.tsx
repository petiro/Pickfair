import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Upload,
  FileKey,
  Lock,
} from "lucide-react";

const certificateSchema = z.object({
  appKey: z.string().min(1, "Application Key obbligatoria"),
  certificate: z.string().min(1, "Certificato obbligatorio"),
  privateKey: z.string().min(1, "Chiave privata obbligatoria"),
});

const loginSchema = z.object({
  username: z.string().min(1, "Username obbligatorio"),
  password: z.string().min(1, "Password obbligatoria"),
});

type CertificateFormData = z.infer<typeof certificateSchema>;
type LoginFormData = z.infer<typeof loginSchema>;

interface BetfairSettings {
  appKey: string;
  hasCertificate: boolean;
  sessionToken: string | null;
  sessionExpiry: string | null;
}

interface ConnectionStatus {
  connected: boolean;
  message: string;
  sessionExpiry?: string;
  hasCertificate?: boolean;
  hasAppKey?: boolean;
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

  const certForm = useForm<CertificateFormData>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      appKey: "",
      certificate: "",
      privateKey: "",
    },
  });

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (settings?.appKey) {
      certForm.setValue("appKey", settings.appKey);
    }
  }, [settings, certForm]);

  const uploadCertMutation = useMutation({
    mutationFn: async (data: CertificateFormData) => {
      return apiRequest("POST", "/api/betfair/upload-certificate", data);
    },
    onSuccess: () => {
      toast({
        title: "Certificato Salvato",
        description: "Ora puoi effettuare il login con username e password",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/betfair"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare il certificato",
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return apiRequest("POST", "/api/betfair/connect", data);
    },
    onSuccess: () => {
      toast({
        title: "Connessione Riuscita",
        description: "Sei connesso a Betfair Exchange Italy",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/betfair"] });
      loginForm.reset();
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

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    field: "certificate" | "privateKey"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      certForm.setValue(field, content);
    };
    reader.readAsText(file);
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

  const hasCertificate = settings?.hasCertificate || status?.hasCertificate;

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
              <div className="flex items-center gap-3 flex-wrap">
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

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={hasCertificate ? "secondary" : "outline"} className="gap-1">
                  <FileKey className="w-3 h-3" />
                  Certificato: {hasCertificate ? "Caricato" : "Non presente"}
                </Badge>
                <Badge variant={settings?.appKey ? "secondary" : "outline"} className="gap-1">
                  <Key className="w-3 h-3" />
                  App Key: {settings?.appKey ? "Configurata" : "Non presente"}
                </Badge>
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
            <Upload className="w-5 h-5" />
            Step 1: Certificato SSL
          </CardTitle>
          <CardDescription>
            Carica il certificato SSL e la chiave privata per l&apos;autenticazione automatica
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...certForm}>
            <form onSubmit={certForm.handleSubmit((data) => uploadCertMutation.mutate(data))} className="space-y-6">
              <FormField
                control={certForm.control}
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
                        href="https://myaccount.betfair.it/accountdetails/mysecurity?showAPI=1"
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
                control={certForm.control}
                name="certificate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificato (.crt)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept=".crt,.pem,.cer"
                          onChange={(e) => handleFileUpload(e, "certificate")}
                          data-testid="input-certificate-file"
                        />
                        <Textarea
                          {...field}
                          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                          className="font-mono text-xs min-h-[100px]"
                          data-testid="input-certificate-text"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Carica il file .crt o incolla il contenuto del certificato
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={certForm.control}
                name="privateKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chiave Privata (.key)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept=".key,.pem"
                          onChange={(e) => handleFileUpload(e, "privateKey")}
                          data-testid="input-key-file"
                        />
                        <Textarea
                          {...field}
                          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                          className="font-mono text-xs min-h-[100px]"
                          data-testid="input-key-text"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Carica il file .key o incolla il contenuto della chiave privata
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                variant="secondary"
                className="w-full gap-2"
                disabled={uploadCertMutation.isPending}
                data-testid="button-save-certificate"
              >
                {uploadCertMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Salva Certificato
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className={!hasCertificate ? "opacity-60" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Step 2: Login Betfair
          </CardTitle>
          <CardDescription>
            {hasCertificate 
              ? "Inserisci le credenziali per connetterti"
              : "Prima carica il certificato SSL (Step 1)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit((data) => connectMutation.mutate(data))} className="space-y-6">
              <FormField
                control={loginForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username Betfair</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Il tuo username Betfair.it"
                        disabled={!hasCertificate}
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={loginForm.control}
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
                          disabled={!hasCertificate}
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={!hasCertificate}
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
                disabled={connectMutation.isPending || !hasCertificate}
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
            <strong>Perch&eacute; serve un certificato?</strong>
          </p>
          <p>
            Betfair Italy richiede l&apos;autenticazione con certificato SSL per 
            l&apos;accesso automatico all&apos;API. Il login interattivo (senza certificato) 
            richiede che la tua App Key sia approvata manualmente da Betfair.
          </p>
          <p>
            <strong>Come creare un certificato:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Genera il certificato con OpenSSL (vedi documentazione Betfair)</li>
            <li>
              Carica il file .crt su{" "}
              <a
                href="https://myaccount.betfair.it/accountdetails/mysecurity?showAPI=1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1"
              >
                La Mia Sicurezza
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Torna qui e carica sia il .crt che il .key</li>
          </ol>
          <p className="pt-2">
            <strong>Limiti Italian Exchange:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Stake minimo BACK: 2.00 (incrementi di 0.50)</li>
            <li>Vincita massima per scommessa: 10,000</li>
            <li>Sessione valida per 20 minuti</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
