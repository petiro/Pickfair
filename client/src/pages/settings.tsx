import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  appKey: z.string().min(1, "Application Key obbligatorio"),
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
  const certInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

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

  const certificateForm = useForm<CertificateFormData>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      appKey: settings?.appKey || "",
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

  const uploadCertificateMutation = useMutation({
    mutationFn: async (data: CertificateFormData) => {
      return apiRequest("POST", "/api/betfair/upload-certificate", data);
    },
    onSuccess: () => {
      toast({
        title: "Certificato Caricato",
        description: "Il certificato SSL e stata salvato. Ora puoi effettuare il login.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/betfair"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore Caricamento",
        description: error.message || "Impossibile caricare il certificato",
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

  const handleFileRead = (
    file: File,
    fieldName: "certificate" | "privateKey"
  ) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      certificateForm.setValue(fieldName, content);
    };
    reader.readAsText(file);
  };

  const onCertificateSubmit = (data: CertificateFormData) => {
    uploadCertificateMutation.mutate(data);
  };

  const onLoginSubmit = (data: LoginFormData) => {
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
                {status?.hasCertificate ? (
                  <Badge variant="outline" className="gap-1">
                    <FileKey className="w-3 h-3" />
                    Certificato configurato
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <FileKey className="w-3 h-3" />
                    Certificato non configurato
                  </Badge>
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
            <FileKey className="w-5 h-5" />
            Passo 1: Certificato SSL
          </CardTitle>
          <CardDescription>
            Betfair Italy richiede l'autenticazione con certificato SSL per i bot automatici
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...certificateForm}>
            <form onSubmit={certificateForm.handleSubmit(onCertificateSubmit)} className="space-y-6">
              <FormField
                control={certificateForm.control}
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
                        href="https://myaccount.betfair.it/accountdetails/mysecurity"
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
                control={certificateForm.control}
                name="certificate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificato SSL (.crt)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <input
                          ref={certInputRef}
                          type="file"
                          accept=".crt,.pem,.cer"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileRead(file, "certificate");
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => certInputRef.current?.click()}
                          className="gap-2 w-full"
                        >
                          <Upload className="w-4 h-4" />
                          {field.value ? "Certificato caricato" : "Carica certificato (.crt)"}
                        </Button>
                        {field.value && (
                          <Textarea
                            {...field}
                            rows={4}
                            className="font-mono text-xs"
                            placeholder="-----BEGIN CERTIFICATE-----"
                            data-testid="textarea-certificate"
                          />
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Il file client-2048.crt generato con OpenSSL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={certificateForm.control}
                name="privateKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chiave Privata (.key)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <input
                          ref={keyInputRef}
                          type="file"
                          accept=".key,.pem"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileRead(file, "privateKey");
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => keyInputRef.current?.click()}
                          className="gap-2 w-full"
                        >
                          <Lock className="w-4 h-4" />
                          {field.value ? "Chiave caricata" : "Carica chiave privata (.key)"}
                        </Button>
                        {field.value && (
                          <Textarea
                            {...field}
                            rows={4}
                            className="font-mono text-xs"
                            placeholder="-----BEGIN RSA PRIVATE KEY-----"
                            data-testid="textarea-private-key"
                          />
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Il file client-2048.key generato con OpenSSL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={uploadCertificateMutation.isPending}
                data-testid="button-upload-certificate"
              >
                {uploadCertificateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Caricamento...
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Passo 2: Login Betfair
          </CardTitle>
          <CardDescription>
            Inserisci le credenziali del tuo account Betfair.it
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!status?.hasCertificate ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileKey className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Certificato non configurato</p>
              <p className="text-sm mt-1">
                Carica il certificato SSL nel passo precedente
              </p>
            </div>
          ) : (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6">
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
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Come Generare il Certificato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Per utilizzare l&apos;API di Betfair Italy Exchange, devi creare un certificato SSL self-signed:
          </p>
          <div className="bg-background/50 p-4 rounded-md font-mono text-xs space-y-2">
            <p># 1. Genera la chiave privata</p>
            <p className="text-foreground">openssl genrsa -out client-2048.key 2048</p>
            <p className="mt-3"># 2. Crea il certificato self-signed</p>
            <p className="text-foreground">openssl req -new -x509 -days 365 -key client-2048.key -out client-2048.crt</p>
          </div>
          <p>
            <strong>Importante:</strong> Dopo aver generato il certificato, devi caricarlo sul tuo account Betfair:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              Vai su{" "}
              <a
                href="https://myaccount.betfair.it/accountdetails/mysecurity"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1"
              >
                La Mia Sicurezza
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Scorri fino a "Automated Betting Program Access"</li>
            <li>Clicca "Edit" e carica il file client-2048.crt</li>
          </ol>
          <p className="pt-2">
            <strong>Limiti Italian Exchange:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Stake minimo BACK: 2.00 (incrementi di 0.50)</li>
            <li>Vincita massima per scommessa: 10,000</li>
            <li>Massimo 50 istruzioni per richiesta</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
