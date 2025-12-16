import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Shield, Zap, BarChart3 } from "lucide-react";

export default function Landing() {
  const features = [
    {
      icon: TrendingUp,
      title: "Dutching Automatico",
      description: "Calcola automaticamente le stake per coprire tutti i risultati esatti selezionati",
    },
    {
      icon: Shield,
      title: "Accesso Esclusivo",
      description: "App protetta con autenticazione sicura, accessibile solo a te",
    },
    {
      icon: Zap,
      title: "Quote in Tempo Reale",
      description: "Visualizza quote aggiornate direttamente da Betfair Exchange Italy",
    },
    {
      icon: BarChart3,
      title: "Tracking P/L",
      description: "Monitora profitti e perdite con storico dettagliato delle scommesse",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        
        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold">BetDutcher</span>
            </div>
            <Button asChild data-testid="button-login-header">
              <a href="/api/login">Accedi</a>
            </Button>
          </header>

          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Automatizza il
              <span className="text-primary"> Dutching </span>
              su Betfair Italy
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Piazza scommesse multiple sui risultati esatti con calcolo automatico delle stake. 
              Integrazione diretta con Betfair Exchange Italy API.
            </p>
            <Button size="lg" asChild data-testid="button-get-started">
              <a href="/api/login" className="gap-2">
                <Zap className="w-5 h-5" />
                Inizia Ora
              </a>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {features.map((feature, index) => (
              <Card key={index} className="bg-card/50 backdrop-blur-sm" data-testid={`card-feature-${index}`}>
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="max-w-2xl mx-auto bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Come Funziona</CardTitle>
              <CardDescription>
                Tre semplici passi per iniziare a fare dutching
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-medium mb-1">Connetti Betfair</h3>
                  <p className="text-sm text-muted-foreground">
                    Inserisci le tue credenziali Betfair Italy e l&apos;Application Key per connetterti all&apos;API
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-medium mb-1">Seleziona Risultati</h3>
                  <p className="text-sm text-muted-foreground">
                    Scegli i risultati esatti su cui vuoi fare dutching e imposta stake o responsabilita
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-medium mb-1">Piazza Scommesse</h3>
                  <p className="text-sm text-muted-foreground">
                    Conferma e piazza automaticamente tutte le scommesse con un click
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>BetDutcher - Strumento personale per automazione scommesse</p>
            <p className="mt-1">Utilizza l&apos;API di Betfair Exchange Italy</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
