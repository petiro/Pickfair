import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Calculator,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  Trash2,
} from "lucide-react";

interface Selection {
  selectionId: number;
  selectionName: string;
  backPrice: number;
  layPrice: number;
  backSize: number;
  laySize: number;
  selected: boolean;
  calculatedStake?: number;
  calculatedReturn?: number;
}

interface Market {
  marketId: string;
  marketName: string;
  selections: Selection[];
}

interface Event {
  id: string;
  name: string;
}

const SCORE_COLORS: Record<string, string> = {
  "0 - 0": "bg-pink-100 dark:bg-pink-950",
  "0 - 1": "bg-pink-50 dark:bg-pink-900",
  "0 - 2": "bg-yellow-100 dark:bg-yellow-950",
  "0 - 3": "bg-green-100 dark:bg-green-950",
  "1 - 0": "bg-pink-50 dark:bg-pink-900",
  "1 - 1": "bg-orange-100 dark:bg-orange-950",
  "1 - 2": "bg-pink-50 dark:bg-pink-900",
  "1 - 3": "bg-pink-100 dark:bg-pink-950",
  "2 - 0": "bg-green-100 dark:bg-green-950",
  "2 - 1": "bg-orange-50 dark:bg-orange-900",
  "2 - 2": "bg-blue-100 dark:bg-blue-950",
  "2 - 3": "bg-pink-50 dark:bg-pink-900",
  "3 - 0": "bg-green-100 dark:bg-green-950",
  "3 - 1": "bg-pink-50 dark:bg-pink-900",
  "3 - 2": "bg-pink-100 dark:bg-pink-950",
  "3 - 3": "bg-yellow-100 dark:bg-yellow-950",
};

export default function Dutching() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const eventIdFromUrl = params.get("eventId");
  const eventNameFromUrl = params.get("eventName");

  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string>(eventIdFromUrl || "");
  const [betType, setBetType] = useState<"back" | "lay">("lay");
  const [calculationMode, setCalculationMode] = useState<"stake" | "liability">("liability");
  const [totalAmount, setTotalAmount] = useState<string>("100");
  const [offset, setOffset] = useState<string>("0");
  const [selections, setSelections] = useState<Selection[]>([]);

  const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/betfair/events"],
    retry: false,
    staleTime: 60000,
  });

  const { data: market, isLoading: marketLoading, refetch: refetchMarket } = useQuery<Market>({
    queryKey: ["/api/betfair/market", selectedEventId, "CORRECT_SCORE"],
    enabled: !!selectedEventId,
    retry: false,
    staleTime: 15000,
  });

  useEffect(() => {
    if (market?.selections) {
      setSelections(market.selections.map(s => ({ ...s, selected: false })));
    }
  }, [market]);

  const selectedSelections = useMemo(() => 
    selections.filter(s => s.selected),
    [selections]
  );

  const bookPercentage = useMemo(() => {
    if (selectedSelections.length === 0) return 0;
    const price = betType === "back" ? "backPrice" : "layPrice";
    return selectedSelections.reduce((sum, s) => sum + (100 / s[price]), 0);
  }, [selectedSelections, betType]);

  const calculatedSelections = useMemo(() => {
    if (selectedSelections.length === 0) return [];
    
    const amount = parseFloat(totalAmount) || 0;
    const offsetValue = parseFloat(offset) || 0;
    
    return selectedSelections.map(s => {
      const price = betType === "back" 
        ? s.backPrice + offsetValue 
        : s.layPrice + offsetValue;
      
      let stake: number;
      if (calculationMode === "stake") {
        stake = (amount * (100 / price)) / bookPercentage;
      } else {
        if (betType === "lay") {
          stake = (amount * (100 / price)) / bookPercentage;
        } else {
          stake = (amount * (100 / price)) / bookPercentage;
        }
      }
      
      const potentialReturn = betType === "back" 
        ? stake * price 
        : amount;
      
      const potentialLoss = betType === "back"
        ? amount
        : stake * (price - 1);
      
      return {
        ...s,
        calculatedStake: Math.max(2, stake),
        effectivePrice: price,
        potentialReturn,
        potentialLoss,
        fillPercentage: s.laySize >= stake ? 100 : (s.laySize / stake) * 100,
      };
    });
  }, [selectedSelections, totalAmount, offset, betType, calculationMode, bookPercentage]);

  const totalStake = useMemo(() => 
    calculatedSelections.reduce((sum, s) => sum + (s.calculatedStake || 0), 0),
    [calculatedSelections]
  );

  const placeBetsMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        marketId: market?.marketId,
        eventName: eventNameFromUrl || events?.find(e => e.id === selectedEventId)?.name || "",
        marketName: market?.marketName || "Correct Score",
        betType,
        selections: calculatedSelections.map(s => ({
          selectionId: s.selectionId,
          selectionName: s.selectionName,
          price: s.effectivePrice,
          stake: s.calculatedStake,
        })),
        totalStake,
        totalLiability: calculationMode === "liability" ? parseFloat(totalAmount) : undefined,
      };
      return apiRequest("POST", "/api/bets/place", payload);
    },
    onSuccess: () => {
      toast({
        title: "Scommesse Piazzate",
        description: `${calculatedSelections.length} scommesse piazzate con successo`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      setSelections(prev => prev.map(s => ({ ...s, selected: false })));
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile piazzare le scommesse",
        variant: "destructive",
      });
    },
  });

  const toggleSelection = (selectionId: number) => {
    setSelections(prev =>
      prev.map(s =>
        s.selectionId === selectionId ? { ...s, selected: !s.selected } : s
      )
    );
  };

  const clearSelections = () => {
    setSelections(prev => prev.map(s => ({ ...s, selected: false })));
  };

  const getScoreColor = (name: string) => {
    return SCORE_COLORS[name] || "bg-muted";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dutching Risultati Esatti</h1>
          <p className="text-muted-foreground">
            Seleziona i risultati e calcola le stake automaticamente
          </p>
        </div>
        {selectedEventId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchMarket()}
            className="gap-2"
            data-testid="button-refresh-odds"
          >
            <RefreshCw className="w-4 h-4" />
            Aggiorna Quote
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seleziona Evento</CardTitle>
              <CardDescription>
                Scegli l&apos;evento su cui fare dutching
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedEventId}
                onValueChange={setSelectedEventId}
              >
                <SelectTrigger data-testid="select-event">
                  <SelectValue placeholder="Seleziona un evento..." />
                </SelectTrigger>
                <SelectContent>
                  {eventsLoading ? (
                    <SelectItem value="loading" disabled>Caricamento...</SelectItem>
                  ) : (
                    events?.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedEventId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Risultati Esatti</CardTitle>
                  <CardDescription>
                    Seleziona i risultati da includere nel dutching
                  </CardDescription>
                </div>
                {selectedSelections.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelections}
                    className="gap-1 text-muted-foreground"
                    data-testid="button-clear-selections"
                  >
                    <Trash2 className="w-4 h-4" />
                    Pulisci
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {marketLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : selections.length > 0 ? (
                  <ScrollArea className="h-[400px] pr-2">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {selections.map((selection) => (
                        <button
                          key={selection.selectionId}
                          onClick={() => toggleSelection(selection.selectionId)}
                          className={`
                            relative p-3 rounded-md text-center transition-all
                            ${getScoreColor(selection.selectionName)}
                            ${selection.selected 
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                              : "hover-elevate"
                            }
                          `}
                          data-testid={`selection-${selection.selectionId}`}
                        >
                          {selection.selected && (
                            <div className="absolute top-1 right-1">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <p className="font-medium text-sm mb-1">
                            {selection.selectionName}
                          </p>
                          <div className="flex items-center justify-center gap-2 text-xs">
                            <span className="text-blue-600 dark:text-blue-400 font-mono">
                              {selection.backPrice.toFixed(2)}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-pink-600 dark:text-pink-400 font-mono">
                              {selection.layPrice.toFixed(2)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nessun mercato risultati esatti disponibile</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Parametri Dutching
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Tipo Scommessa</Label>
                <RadioGroup
                  value={betType}
                  onValueChange={(v) => setBetType(v as "back" | "lay")}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="back" id="back" data-testid="radio-back" />
                    <Label htmlFor="back" className="flex items-center gap-1 cursor-pointer">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      Punta
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="lay" id="lay" data-testid="radio-lay" />
                    <Label htmlFor="lay" className="flex items-center gap-1 cursor-pointer">
                      <TrendingDown className="w-4 h-4 text-pink-500" />
                      Banca
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label>Modalita Calcolo</Label>
                <RadioGroup
                  value={calculationMode}
                  onValueChange={(v) => setCalculationMode(v as "stake" | "liability")}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="stake" id="stake" data-testid="radio-stake" />
                    <Label htmlFor="stake" className="cursor-pointer">
                      Stake Disponibile
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="liability" id="liability" data-testid="radio-liability" />
                    <Label htmlFor="liability" className="cursor-pointer">
                      Responsabilita
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">
                  {calculationMode === "stake" ? "Stake Totale" : "Responsabilita"}
                </Label>
                <div className="relative">
                  <Input
                    id="amount"
                    type="number"
                    min="2"
                    max="10000"
                    step="0.5"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="pr-8"
                    data-testid="input-amount"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    &euro;
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offset">Offset Quote</Label>
                <Input
                  id="offset"
                  type="number"
                  step="0.1"
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  data-testid="input-offset"
                />
                <p className="text-xs text-muted-foreground">
                  Aggiungi/sottrai dalle quote correnti
                </p>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Perc. Book</span>
                  <span className="font-mono font-medium">
                    {bookPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Selezioni</span>
                  <span className="font-mono font-medium">
                    {selectedSelections.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Stake Totale</span>
                  <span className="text-lg font-mono font-bold">
                    &euro;{totalStake.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {calculatedSelections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Riepilogo Scommesse</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sel.</TableHead>
                        <TableHead className="text-right">Quota</TableHead>
                        <TableHead className="text-right">Stake</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculatedSelections.map((sel) => (
                        <TableRow key={sel.selectionId}>
                          <TableCell className="font-medium text-xs">
                            {sel.selectionName}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {sel.effectivePrice.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            &euro;{sel.calculatedStake?.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <Button
                  className="w-full mt-4 gap-2"
                  size="lg"
                  disabled={calculatedSelections.length === 0 || placeBetsMutation.isPending}
                  onClick={() => placeBetsMutation.mutate()}
                  data-testid="button-place-bets"
                >
                  {placeBetsMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Piazzamento...
                    </>
                  ) : (
                    <>
                      <Target className="w-4 h-4" />
                      Piazza {calculatedSelections.length} Scommesse
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
