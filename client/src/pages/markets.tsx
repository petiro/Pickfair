import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Link } from "wouter";
import {
  Search,
  Calendar,
  Clock,
  ChevronRight,
  RefreshCw,
  Target,
} from "lucide-react";

interface Event {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
  openDate: string;
}

interface Market {
  marketId: string;
  marketName: string;
  totalMatched: number;
  eventId: string;
  eventName: string;
}

interface Competition {
  id: string;
  name: string;
  region: string;
}

export default function Markets() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");

  const { data: competitions, isLoading: competitionsLoading } = useQuery<Competition[]>({
    queryKey: ["/api/betfair/competitions"],
    retry: false,
    staleTime: 60000,
  });

  const { data: events, isLoading: eventsLoading, refetch } = useQuery<Event[]>({
    queryKey: ["/api/betfair/events", selectedCompetition],
    retry: false,
    staleTime: 30000,
  });

  const filteredEvents = events?.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isTomorrow = (dateStr: string) => {
    const date = new Date(dateStr);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mercati</h1>
          <p className="text-muted-foreground">
            Esplora eventi e mercati calcio disponibili
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
          data-testid="button-refresh-markets"
        >
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtri</CardTitle>
          <CardDescription>Cerca e filtra gli eventi disponibili</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca eventi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-events"
              />
            </div>
            <Select
              value={selectedCompetition}
              onValueChange={setSelectedCompetition}
            >
              <SelectTrigger className="w-full sm:w-[250px]" data-testid="select-competition">
                <SelectValue placeholder="Tutte le competizioni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le competizioni</SelectItem>
                {competitionsLoading ? (
                  <SelectItem value="loading" disabled>Caricamento...</SelectItem>
                ) : (
                  competitions?.map((comp) => (
                    <SelectItem key={comp.id} value={comp.id}>
                      {comp.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Eventi Disponibili</CardTitle>
            <CardDescription>
              {filteredEvents.length} eventi trovati
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredEvents.length > 0 ? (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-4 rounded-md bg-muted/50 hover-elevate transition-colors"
                    data-testid={`event-item-${event.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium">{event.name}</p>
                        {isToday(event.openDate) && (
                          <Badge variant="default" className="text-xs">Oggi</Badge>
                        )}
                        {isTomorrow(event.openDate) && (
                          <Badge variant="secondary" className="text-xs">Domani</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(event.openDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {event.timezone}
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1">
                      <Link href={`/dutching?eventId=${event.id}&eventName=${encodeURIComponent(event.name)}`}>
                        <Target className="w-4 h-4" />
                        Dutch
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nessun evento trovato</p>
              <p className="text-sm mt-1">
                Prova a modificare i filtri di ricerca
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
