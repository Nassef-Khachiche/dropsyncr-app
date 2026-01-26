import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { 
  MessageSquare,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  Package,
  User,
  Calendar,
  ArrowUpCircle,
  Circle,
  ArrowDownCircle,
  MoreVertical,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';

interface TicketSystemProps {
  activeProfile: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  client: {
    name: string;
    logo: string;
  };
  subject: string;
  category: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  orderReference: string;
  createdAt: string;
  lastUpdated: string;
  messages: TicketMessage[];
  assignedTo?: string;
}

interface TicketMessage {
  id: string;
  sender: string;
  senderType: 'client' | 'admin';
  message: string;
  timestamp: string;
  attachments?: string[];
}

const mockTickets: Ticket[] = [
  {
    id: '1',
    ticketNumber: 'TKT-2024-0143',
    client: {
      name: 'Shopcentral',
      logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200'
    },
    subject: 'Verkeerde product verzonden in order #BOL-45821',
    category: 'Verkeerde product',
    status: 'open',
    priority: 'high',
    orderReference: 'BOL-45821',
    createdAt: '2024-10-14 09:23',
    lastUpdated: '2024-10-14 09:23',
    messages: [
      {
        id: 'm1',
        sender: 'Shopcentral',
        senderType: 'client',
        message: 'Beste KLK team,\n\nBij order BOL-45821 is helaas het verkeerde product verzonden. De klant heeft een blauwe hardloopschoen besteld (SKU: SHOE-BLUE-42), maar heeft een rode ontvangen (SKU: SHOE-RED-42).\n\nKunnen jullie dit zo snel mogelijk oplossen? De klant is erg ontevreden.\n\nMvg,\nShopcentral Support',
        timestamp: '2024-10-14 09:23',
      }
    ]
  },
  {
    id: '2',
    ticketNumber: 'TKT-2024-0142',
    client: {
      name: 'Inovra',
      logo: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200'
    },
    subject: 'Beschadigde verpakking bij verzending',
    category: 'Beschadiging',
    status: 'in-progress',
    priority: 'medium',
    orderReference: 'BOL-45789',
    createdAt: '2024-10-13 16:45',
    lastUpdated: '2024-10-14 08:15',
    assignedTo: 'John Bakker',
    messages: [
      {
        id: 'm1',
        sender: 'Inovra',
        senderType: 'client',
        message: 'Order BOL-45789 is beschadigd aangekomen bij de klant. De doos was opengescheurd en er zat een deuk in het product. Kunnen jullie dit onderzoeken?',
        timestamp: '2024-10-13 16:45',
      },
      {
        id: 'm2',
        sender: 'John Bakker',
        senderType: 'admin',
        message: 'Bedankt voor je melding. We hebben de foto\'s ontvangen en gaan dit intern onderzoeken. We nemen vandaag nog contact op met de vervoerder. Ik houd je op de hoogte.',
        timestamp: '2024-10-14 08:15',
      }
    ]
  },
  {
    id: '3',
    ticketNumber: 'TKT-2024-0141',
    client: {
      name: 'TechGear Solutions',
      logo: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'
    },
    subject: 'Vraag over voorraadniveaus',
    category: 'Voorraad',
    status: 'resolved',
    priority: 'low',
    orderReference: '-',
    createdAt: '2024-10-12 11:20',
    lastUpdated: '2024-10-13 14:30',
    assignedTo: 'Sarah de Vries',
    messages: [
      {
        id: 'm1',
        sender: 'TechGear Solutions',
        senderType: 'client',
        message: 'We zien afwijkingen in de voorraadtelling voor SKU TECH-001. Kunnen jullie dit controleren?',
        timestamp: '2024-10-12 11:20',
      },
      {
        id: 'm2',
        sender: 'Sarah de Vries',
        senderType: 'admin',
        message: 'We hebben een volledige inventarisatie gedaan. De voorraad is correct, het was een synchronisatie probleem. Dit is nu opgelost.',
        timestamp: '2024-10-13 14:30',
      }
    ]
  },
  {
    id: '4',
    ticketNumber: 'TKT-2024-0140',
    client: {
      name: 'HomeStyle Living',
      logo: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200'
    },
    subject: 'Te late verzending order #BOL-45623',
    category: 'Late verzending',
    status: 'closed',
    priority: 'medium',
    orderReference: 'BOL-45623',
    createdAt: '2024-10-11 14:12',
    lastUpdated: '2024-10-12 09:45',
    assignedTo: 'John Bakker',
    messages: [
      {
        id: 'm1',
        sender: 'HomeStyle Living',
        senderType: 'client',
        message: 'Order BOL-45623 had gisteren verzonden moeten worden maar is nog niet verwerkt.',
        timestamp: '2024-10-11 14:12',
      },
      {
        id: 'm2',
        sender: 'John Bakker',
        senderType: 'admin',
        message: 'Onze excuses voor de vertraging. De order is nu verwerkt en vandaag verzonden. Track & trace code: 3SABCD1234567890',
        timestamp: '2024-10-11 16:30',
      },
      {
        id: 'm3',
        sender: 'HomeStyle Living',
        senderType: 'client',
        message: 'Bedankt voor de snelle actie! Ticket kan gesloten worden.',
        timestamp: '2024-10-12 09:45',
      }
    ]
  },
  {
    id: '5',
    ticketNumber: 'TKT-2024-0139',
    client: {
      name: 'Shopcentral',
      logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200'
    },
    subject: 'Ontbrekend artikel in verzending',
    category: 'Ontbrekend product',
    status: 'open',
    priority: 'urgent',
    orderReference: 'BOL-45512',
    createdAt: '2024-10-14 10:05',
    lastUpdated: '2024-10-14 10:05',
    messages: [
      {
        id: 'm1',
        sender: 'Shopcentral',
        senderType: 'client',
        message: 'URGENT: Klant heeft order BOL-45512 ontvangen maar er ontbreekt 1 van de 2 producten. Graag zo snel mogelijk actie!',
        timestamp: '2024-10-14 10:05',
      }
    ]
  }
];

const statusConfig = {
  open: { label: 'Open', color: 'bg-blue-500', icon: Circle },
  'in-progress': { label: 'In Behandeling', color: 'bg-amber-500', icon: Clock },
  resolved: { label: 'Opgelost', color: 'bg-emerald-500', icon: CheckCircle2 },
  closed: { label: 'Gesloten', color: 'bg-slate-500', icon: CheckCircle2 }
};

const priorityConfig = {
  low: { label: 'Laag', color: 'border-slate-300 text-slate-700 bg-slate-50', icon: ArrowDownCircle },
  medium: { label: 'Gemiddeld', color: 'border-blue-300 text-blue-700 bg-blue-50', icon: Circle },
  high: { label: 'Hoog', color: 'border-orange-300 text-orange-700 bg-orange-50', icon: ArrowUpCircle },
  urgent: { label: 'Urgent', color: 'border-red-300 text-red-700 bg-red-50', icon: AlertCircle }
};

export function TicketSystem({ activeProfile }: TicketSystemProps) {
  const [tickets, setTickets] = useState<Ticket[]>(mockTickets);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || ticket.priority === filterPriority;
    const matchesSearch = searchQuery === '' || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.orderReference.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const getStatusCounts = () => {
    return {
      all: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      'in-progress': tickets.filter(t => t.status === 'in-progress').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
      closed: tickets.filter(t => t.status === 'closed').length,
    };
  };

  const statusCounts = getStatusCounts();

  const handleStatusChange = (ticketId: string, newStatus: Ticket['status']) => {
    setTickets(tickets.map(t => 
      t.id === ticketId ? { ...t, status: newStatus, lastUpdated: new Date().toLocaleString('nl-NL') } : t
    ));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status: newStatus });
    }
    toast.success('Status bijgewerkt');
  };

  const handleSendReply = () => {
    if (!selectedTicket || !replyMessage.trim()) return;

    const newMessage: TicketMessage = {
      id: `m${Date.now()}`,
      sender: 'KLK Admin',
      senderType: 'admin',
      message: replyMessage,
      timestamp: new Date().toLocaleString('nl-NL', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };

    const updatedTicket = {
      ...selectedTicket,
      messages: [...selectedTicket.messages, newMessage],
      lastUpdated: newMessage.timestamp,
      status: selectedTicket.status === 'open' ? 'in-progress' as const : selectedTicket.status
    };

    setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
    setSelectedTicket(updatedTicket);
    setReplyMessage('');
    toast.success('Antwoord verstuurd');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Support Tickets
          </h2>
          <p className="text-slate-600">Beheer alle support aanvragen van fulfilment klanten</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'all' ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'}`}
          onClick={() => setFilterStatus('all')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-slate-600 mb-1">Totaal</p>
            <p className="text-2xl text-slate-900">{statusCounts.all}</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'open' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}
          onClick={() => setFilterStatus('open')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-slate-600 mb-1">Open</p>
            <p className="text-2xl text-blue-600">{statusCounts.open}</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'in-progress' ? 'ring-2 ring-amber-500' : 'hover:shadow-md'}`}
          onClick={() => setFilterStatus('in-progress')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-slate-600 mb-1">In Behandeling</p>
            <p className="text-2xl text-amber-600">{statusCounts['in-progress']}</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'resolved' ? 'ring-2 ring-emerald-500' : 'hover:shadow-md'}`}
          onClick={() => setFilterStatus('resolved')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-slate-600 mb-1">Opgelost</p>
            <p className="text-2xl text-emerald-600">{statusCounts.resolved}</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'closed' ? 'ring-2 ring-slate-500' : 'hover:shadow-md'}`}
          onClick={() => setFilterStatus('closed')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-slate-600 mb-1">Gesloten</p>
            <p className="text-2xl text-slate-600">{statusCounts.closed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Zoek op ticket nummer, onderwerp, klant of order..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-slate-200"
              />
            </div>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full md:w-[180px] border-slate-200">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Prioriteit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle prioriteiten</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">Hoog</SelectItem>
                <SelectItem value="medium">Gemiddeld</SelectItem>
                <SelectItem value="low">Laag</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Tickets ({filteredTickets.length})</CardTitle>
          <CardDescription>Klik op een ticket om details te bekijken en te reageren</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Ticket</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Onderwerp</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Prioriteit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aangemaakt</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      Geen tickets gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTickets.map((ticket) => {
                    const StatusIcon = statusConfig[ticket.status].icon;
                    const PriorityIcon = priorityConfig[ticket.priority].icon;
                    
                    return (
                      <TableRow 
                        key={ticket.id} 
                        className="hover:bg-slate-50/50 cursor-pointer"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-indigo-600">{ticket.ticketNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                              <img 
                                src={ticket.client.logo} 
                                alt={ticket.client.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-sm text-slate-900">{ticket.client.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm text-slate-900 truncate">{ticket.subject}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs border-slate-300 text-slate-700">
                            {ticket.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ticket.orderReference !== '-' ? (
                            <div className="flex items-center gap-1 text-xs text-slate-600">
                              <Package className="w-3 h-3" />
                              {ticket.orderReference}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${priorityConfig[ticket.priority].color} gap-1`}>
                            <PriorityIcon className="w-3 h-3" />
                            {priorityConfig[ticket.priority].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusConfig[ticket.status].color} border-0 gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[ticket.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-slate-600">
                            <Calendar className="w-3 h-3" />
                            {ticket.createdAt}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(ticket.id, 'in-progress');
                              }}>
                                In behandeling nemen
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(ticket.id, 'resolved');
                              }}>
                                Markeer als opgelost
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(ticket.id, 'closed');
                              }}>
                                Sluit ticket
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <DialogTitle className="text-xl mb-2">{selectedTicket.subject}</DialogTitle>
                    <DialogDescription className="sr-only">
                      Ticket details en conversatie geschiedenis
                    </DialogDescription>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <Badge variant="outline" className="gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {selectedTicket.ticketNumber}
                      </Badge>
                      {selectedTicket.orderReference !== '-' && (
                        <Badge variant="outline" className="gap-1">
                          <Package className="w-3 h-3" />
                          {selectedTicket.orderReference}
                        </Badge>
                      )}
                      <Badge variant="outline" className={priorityConfig[selectedTicket.priority].color}>
                        {priorityConfig[selectedTicket.priority].label}
                      </Badge>
                      <Badge className={`${statusConfig[selectedTicket.status].color} border-0`}>
                        {statusConfig[selectedTicket.status].label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <img 
                      src={selectedTicket.client.logo} 
                      alt={selectedTicket.client.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                    <div className="text-right">
                      <p className="text-sm text-slate-900">{selectedTicket.client.name}</p>
                      <p className="text-xs text-slate-500">{selectedTicket.createdAt}</p>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Messages Thread */}
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4 py-4">
                  {selectedTicket.messages.map((message, idx) => (
                    <div 
                      key={message.id}
                      className={`flex gap-3 ${message.senderType === 'admin' ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={message.senderType === 'client' ? selectedTicket.client.logo : undefined} />
                        <AvatarFallback className={message.senderType === 'admin' ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white' : 'bg-slate-200'}>
                          {message.senderType === 'admin' ? 'KLK' : selectedTicket.client.name.substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`flex-1 ${message.senderType === 'admin' ? 'text-right' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-slate-900">{message.sender}</span>
                          <span className="text-xs text-slate-500">{message.timestamp}</span>
                        </div>
                        <div className={`inline-block p-4 rounded-xl ${
                          message.senderType === 'admin' 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white' 
                            : 'bg-slate-100 text-slate-900'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Reply Section */}
              {selectedTicket.status !== 'closed' && (
                <div className="border-t pt-4 space-y-3">
                  <Label>Antwoord</Label>
                  <Textarea
                    placeholder="Typ je antwoord aan de klant..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <Select 
                      value={selectedTicket.status} 
                      onValueChange={(value) => handleStatusChange(selectedTicket.id, value as Ticket['status'])}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in-progress">In Behandeling</SelectItem>
                        <SelectItem value="resolved">Opgelost</SelectItem>
                        <SelectItem value="closed">Gesloten</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleSendReply}
                      disabled={!replyMessage.trim()}
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Verstuur Antwoord
                    </Button>
                  </div>
                </div>
              )}

              {selectedTicket.status === 'closed' && (
                <div className="border-t pt-4">
                  <div className="bg-slate-100 rounded-lg p-4 text-center">
                    <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-700">Dit ticket is gesloten</p>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
