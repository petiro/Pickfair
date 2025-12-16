import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { Bet } from "@shared/schema";

interface AccountFunds {
  availableToBetBalance: number;
  exposure: number;
  retainedCommission: number;
  exposureLimit: number;
  discountRate: number;
  pointsBalance: number;
  wallet: string;
}

interface StatsCardProps {
  title: string;
  value: string;
  description?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  isLoading?: boolean;
}

function StatsCard({ title, value, description, icon, trend, isLoading }: StatsCardProps) {
  return (
    <Card data-testid={`stats-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${
              trend === "up" ? "text-green-600 dark:text-green-500" :
              trend === "down" ? "text-red-600 dark:text-red-500" :
              ""
            }`}>
              {value}
            </span>
            {trend && (
              trend === "up" ? (
                <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-500" />
              ) : trend === "down" ? (
                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-500" />
              ) : null
            )}
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "won":
      return "default";
    case "lost":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "won":
      return "Vinta";
    case "lost":
      return "Persa";
    case "pending":
      return "In Attesa";
    case "placed":
      return "Piazzata";
    default:
      return status;
  }
}

export default function Dashboard() {
  const { data: accountFunds, isLoading: fundsLoading, refetch: refetchFunds } = useQuery<AccountFunds>({
    queryKey: ["/api/betfair/account-funds"],
    retry: false,
    staleTime: 30000,
  });

  const { data: recentBets, isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: ["/api/bets/recent"],
    retry: false,
    staleTime: 30000,
  });

  const { data: connectionStatus } = useQuery<{ connected: boolean; message: string }>({
    queryKey: ["/api/betfair/status"],
    retry: false,
    staleTime: 60000,
  });

  const todayPL = recentBets?.reduce((sum, bet) => {
    if (bet.profitLoss && bet.settledAt) {
      const settledDate = new Date(bet.settledAt);
      const today = new Date();
      if (settledDate.toDateString() === today.toDateString()) {
        return sum + parseFloat(bet.profitLoss);
      }
    }
    return sum;
  }, 0) || 0;

  const pendingBetsCount = recentBets?.filter(b => b.status === "pending" || b.status === "placed").length || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Panoramica del tuo account Betfair Italy
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connectionStatus && (
            <Badge
              variant={connectionStatus.connected ? "default" : "destructive"}
              className="gap-1"
              data-testid="badge-connection-status"
            >
              {connectionStatus.connected ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              {connectionStatus.connected ? "Connesso" : "Disconnesso"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchFunds()}
            className="gap-2"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
            Aggiorna
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Saldo Disponibile"
          value={fundsLoading ? "-" : `${accountFunds?.availableToBetBalance?.toFixed(2) || "0.00"}`}
          description="Fondi disponibili per scommettere"
          icon={<Wallet className="w-5 h-5" />}
          isLoading={fundsLoading}
        />
        <StatsCard
          title="Esposizione"
          value={fundsLoading ? "-" : `${accountFunds?.exposure?.toFixed(2) || "0.00"}`}
          description="Responsabilita corrente"
          icon={<TrendingDown className="w-5 h-5" />}
          isLoading={fundsLoading}
        />
        <StatsCard
          title="P/L Oggi"
          value={`${todayPL >= 0 ? "+" : ""}${todayPL.toFixed(2)}`}
          description="Profitto/Perdita giornaliero"
          icon={todayPL >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          trend={todayPL > 0 ? "up" : todayPL < 0 ? "down" : "neutral"}
          isLoading={betsLoading}
        />
        <StatsCard
          title="Scommesse Attive"
          value={pendingBetsCount.toString()}
          description="In attesa di risultato"
          icon={<Clock className="w-5 h-5" />}
          isLoading={betsLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Scommesse Recenti</CardTitle>
              <CardDescription>Le tue ultime operazioni</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/history" className="gap-1">
                Vedi Tutte
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {betsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentBets && recentBets.length > 0 ? (
              <div className="space-y-3">
                {recentBets.slice(0, 5).map((bet) => (
                  <div
                    key={bet.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`bet-item-${bet.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{bet.eventName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {bet.marketName} - {bet.betType.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-mono font-medium">
                          {parseFloat(bet.totalStake).toFixed(2)}
                        </p>
                        {bet.profitLoss && (
                          <p className={`text-xs font-mono ${
                            parseFloat(bet.profitLoss) >= 0
                              ? "text-green-600 dark:text-green-500"
                              : "text-red-600 dark:text-red-500"
                          }`}>
                            {parseFloat(bet.profitLoss) >= 0 ? "+" : ""}
                            {parseFloat(bet.profitLoss).toFixed(2)}
                          </p>
                        )}
                      </div>
                      <Badge variant={getStatusBadgeVariant(bet.status)} className="text-xs">
                        {getStatusLabel(bet.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nessuna scommessa recente</p>
                <Button variant="ghost" asChild className="mt-2">
                  <Link href="/dutching">Inizia a scommettere</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>Accedi velocemente alle funzionalita principali</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-3" asChild data-testid="button-quick-dutching">
              <Link href="/dutching">
                <div className="w-10 h-10 rounded-md bg-primary-foreground/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Nuovo Dutching</p>
                  <p className="text-xs opacity-80">Crea una nuova strategia dutching</p>
                </div>
              </Link>
            </Button>
            <Button variant="secondary" className="w-full justify-start gap-3" asChild data-testid="button-quick-markets">
              <Link href="/markets">
                <div className="w-10 h-10 rounded-md bg-secondary-foreground/10 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Esplora Mercati</p>
                  <p className="text-xs opacity-80">Trova eventi e mercati disponibili</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild data-testid="button-quick-settings">
              <Link href="/settings">
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Configura Betfair</p>
                  <p className="text-xs opacity-80">Gestisci connessione API</p>
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
