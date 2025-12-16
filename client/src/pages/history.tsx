import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import type { Bet } from "@shared/schema";

interface BetSelection {
  selectionId: number;
  selectionName: string;
  price: number;
  stake: number;
  status?: string;
  profitLoss?: number;
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "won":
      return "default";
    case "lost":
      return "destructive";
    case "pending":
    case "placed":
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
    case "void":
      return "Annullata";
    default:
      return status;
  }
}

export default function History() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedBets, setExpandedBets] = useState<Set<string>>(new Set());

  const { data: bets, isLoading, refetch } = useQuery<Bet[]>({
    queryKey: ["/api/bets"],
    retry: false,
    staleTime: 30000,
  });

  const filteredBets = bets?.filter((bet) => {
    if (statusFilter === "all") return true;
    return bet.status === statusFilter;
  }) || [];

  const stats = {
    totalBets: bets?.length || 0,
    wonBets: bets?.filter(b => b.status === "won").length || 0,
    lostBets: bets?.filter(b => b.status === "lost").length || 0,
    totalPL: bets?.reduce((sum, b) => sum + (parseFloat(b.profitLoss || "0")), 0) || 0,
    totalStaked: bets?.reduce((sum, b) => sum + parseFloat(b.totalStake), 0) || 0,
  };

  const winRate = stats.totalBets > 0 
    ? ((stats.wonBets / (stats.wonBets + stats.lostBets)) * 100) || 0 
    : 0;

  const toggleExpanded = (betId: string) => {
    setExpandedBets(prev => {
      const next = new Set(prev);
      if (next.has(betId)) {
        next.delete(betId);
      } else {
        next.add(betId);
      }
      return next;
    });
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storico Scommesse</h1>
          <p className="text-muted-foreground">
            Visualizza tutte le tue scommesse e il tracking P/L
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
          data-testid="button-refresh-history"
        >
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scommesse Totali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{stats.totalBets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tasso Vittoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold font-mono">{winRate.toFixed(1)}%</p>
              <span className="text-sm text-muted-foreground">
                ({stats.wonBets}W / {stats.lostBets}L)
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale Puntato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              &euro;{stats.totalStaked.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Profitto/Perdita Netto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold font-mono ${
                stats.totalPL >= 0 
                  ? "text-green-600 dark:text-green-500" 
                  : "text-red-600 dark:text-red-500"
              }`}>
                {stats.totalPL >= 0 ? "+" : ""}&euro;{stats.totalPL.toFixed(2)}
              </p>
              {stats.totalPL >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Dettaglio Scommesse</CardTitle>
            <CardDescription>
              {filteredBets.length} scommesse {statusFilter !== "all" ? `(${getStatusLabel(statusFilter)})` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Tutti gli stati" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="pending">In Attesa</SelectItem>
                <SelectItem value="placed">Piazzate</SelectItem>
                <SelectItem value="won">Vinte</SelectItem>
                <SelectItem value="lost">Perse</SelectItem>
                <SelectItem value="void">Annullate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredBets.length > 0 ? (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {filteredBets.map((bet) => {
                  const isExpanded = expandedBets.has(bet.id);
                  const selections = bet.selections as BetSelection[];
                  
                  return (
                    <Collapsible key={bet.id} open={isExpanded}>
                      <div
                        className="rounded-md border bg-card"
                        data-testid={`bet-row-${bet.id}`}
                      >
                        <CollapsibleTrigger
                          className="w-full flex items-center justify-between p-4 text-left hover-elevate rounded-md"
                          onClick={() => toggleExpanded(bet.id)}
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{bet.eventName}</p>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {formatDate(bet.placedAt)}
                                </span>
                                <span>
                                  {bet.betType.toUpperCase()} - {selections?.length || 0} sel.
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className="font-mono font-medium">
                                &euro;{parseFloat(bet.totalStake).toFixed(2)}
                              </p>
                              {bet.profitLoss && (
                                <p className={`text-sm font-mono ${
                                  parseFloat(bet.profitLoss) >= 0
                                    ? "text-green-600 dark:text-green-500"
                                    : "text-red-600 dark:text-red-500"
                                }`}>
                                  {parseFloat(bet.profitLoss) >= 0 ? "+" : ""}
                                  &euro;{parseFloat(bet.profitLoss).toFixed(2)}
                                </p>
                              )}
                            </div>
                            <Badge variant={getStatusBadgeVariant(bet.status)}>
                              {getStatusLabel(bet.status)}
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-2 border-t">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Selezione</TableHead>
                                  <TableHead className="text-right">Quota</TableHead>
                                  <TableHead className="text-right">Stake</TableHead>
                                  <TableHead className="text-right">P/L</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selections?.map((sel, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium">
                                      {sel.selectionName}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {sel.price?.toFixed(2) || "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      &euro;{sel.stake?.toFixed(2) || "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {sel.profitLoss !== undefined ? (
                                        <span className={
                                          sel.profitLoss >= 0
                                            ? "text-green-600 dark:text-green-500"
                                            : "text-red-600 dark:text-red-500"
                                        }>
                                          {sel.profitLoss >= 0 ? "+" : ""}
                                          &euro;{sel.profitLoss.toFixed(2)}
                                        </span>
                                      ) : "-"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nessuna scommessa trovata</p>
              <p className="text-sm mt-1">
                Le tue scommesse appariranno qui
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
