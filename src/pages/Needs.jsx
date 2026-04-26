import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { servexApi } from '@/api/servexClient';
import NeedCard from '@/components/needs/NeedCard';
import NeedFormModal from '@/components/needs/NeedFormModal';
import DispatchModal from '@/components/dispatch/DispatchModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPinned, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function parseSurveyRawInput(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export default function Needs() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailNeed, setDetailNeed] = useState(null);
  const [dispatching, setDispatching] = useState(null);
  const [search, setSearch] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: needs = [], isLoading } = useQuery({
    queryKey: ['needs'],
    queryFn: () => servexApi.entities.CommunityNeed.list('-created_date', 200),
  });
  const { data: volunteers = [] } = useQuery({
    queryKey: ['volunteers'],
    queryFn: () => servexApi.entities.Volunteer.list(),
  });

  const filtered = needs.filter(n => {
    const matchSearch = !search || n.title?.toLowerCase().includes(search.toLowerCase()) || n.location?.toLowerCase().includes(search.toLowerCase());
    const matchUrgency = filterUrgency === 'all' || n.urgency_level === filterUrgency;
    const matchStatus = filterStatus === 'all' || n.status === filterStatus;
    return matchSearch && matchUrgency && matchStatus;
  });

  const handleDelete = async (id) => {
    await servexApi.entities.CommunityNeed.delete(id);
    qc.invalidateQueries(['needs']);
    setDetailNeed(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-jakarta text-foreground">Community Needs</h1>
          <p className="text-muted-foreground text-sm mt-1">{needs.length} total needs tracked</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Log Need
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by title or location..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterUrgency} onValueChange={setFilterUrgency}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Urgency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            {['critical', 'high', 'medium', 'low'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['unaddressed', 'assigned', 'in_progress', 'resolved'].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-40 bg-card rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">No needs found</p>
          <p className="text-sm mt-1">Log a new community need to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(need => (
            <NeedCard key={need.id} need={need} onClick={() => setDetailNeed(need)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detailNeed && (
        <Dialog open={!!detailNeed} onOpenChange={() => setDetailNeed(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-jakarta">{detailNeed.title}</DialogTitle>
            </DialogHeader>
            {detailNeed.photo_url && (
              <div className="w-full h-48 rounded-xl overflow-hidden bg-secondary">
                <img 
                  src={`${(import.meta.env.VITE_API_BASE_URL || '/api').replace('/api', '')}${detailNeed.photo_url}`} 
                  alt={detailNeed.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-3 text-sm">
              {(detailNeed.source === 'survey' || detailNeed.source_ref_type === 'survex_survey') && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserRound className="w-3.5 h-3.5" /> Field Officer
                    </div>
                    <p className="font-medium mt-1">{detailNeed.reported_by_name || 'Unknown'}</p>
                    {detailNeed.reported_by_phone && <p className="text-xs text-muted-foreground">{detailNeed.reported_by_phone}</p>}
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPinned className="w-3.5 h-3.5" /> GPS
                    </div>
                    <p className="font-medium mt-1">
                      {detailNeed.location_coords?.lat && detailNeed.location_coords?.lng
                        ? `${Number(detailNeed.location_coords.lat).toFixed(4)}, ${Number(detailNeed.location_coords.lng).toFixed(4)}`
                        : 'Not shared'}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{detailNeed.location}</span></div>
                <div><span className="text-muted-foreground">Urgency:</span> <span className="font-medium capitalize">{detailNeed.urgency_level}</span></div>
                <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{detailNeed.category?.replace(/_/g, ' ')}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{detailNeed.status?.replace(/_/g, ' ')}</span></div>
                {detailNeed.beneficiaries_count && <div><span className="text-muted-foreground">Affected:</span> <span className="font-medium">{detailNeed.beneficiaries_count} households/users</span></div>}
                {detailNeed.urgency_score && <div><span className="text-muted-foreground">AI Score:</span> <span className="font-medium">{detailNeed.urgency_score}/100</span></div>}
              </div>
              {detailNeed.description && <p className="text-muted-foreground">{detailNeed.description}</p>}
              {detailNeed.ai_summary && (
                <div className="bg-accent rounded-lg p-3 text-accent-foreground">
                  <p className="text-xs font-medium mb-1">AI Summary</p>
                  <p>{detailNeed.ai_summary}</p>
                </div>
              )}
              {(() => {
                const survey = parseSurveyRawInput(detailNeed.raw_input);
                const hasSurveyData = Object.keys(survey).length > 0;
                if (!hasSurveyData) return null;

                return (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Survey Responses</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Need:</span> <span className="font-medium">{survey.need_type || '-'}</span></div>
                      <div><span className="text-muted-foreground">Days:</span> <span className="font-medium">{survey.days_of_issue || '-'}</span></div>
                      <div><span className="text-muted-foreground">Groups:</span> <span className="font-medium">{survey.vulnerable_groups || '-'}</span></div>
                      <div><span className="text-muted-foreground">Support:</span> <span className="font-medium">{survey.other_ngo_coverage || '-'}</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(detailNeed.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing(detailNeed); setDetailNeed(null); setShowForm(true); }}>Edit</Button>
                <Button size="sm" onClick={() => { setDispatching(detailNeed); setDetailNeed(null); }}>Dispatch</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showForm && (
        <NeedFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => qc.invalidateQueries(['needs'])}
          initial={editing}
        />
      )}

      {dispatching && (
        <DispatchModal
          open={!!dispatching}
          onClose={() => setDispatching(null)}
          onSaved={() => qc.invalidateQueries(['needs', 'dispatches'])}
          need={dispatching}
          volunteers={volunteers}
        />
      )}
    </div>
  );
}
