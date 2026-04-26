import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles } from 'lucide-react';
import { servexApi } from '@/api/servexClient';
import { toast } from '@/components/ui/use-toast';

function mapUrgencyToPriority(urgency) {
  const value = String(urgency || '').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'normal';
}

function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCoordinates(need) {
  const lat = toCoordinate(need?.location_coords?.lat);
  const lng = toCoordinate(need?.location_coords?.lng);
  return lat !== null
    && lng !== null
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(lat === 0 && lng === 0);
}

function isGpsLabel(value) {
  return /^gps\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/i.test(String(value || '').trim());
}

function getLocationDisplayName(need) {
  if (need?.location && !isGpsLabel(need.location)) {
    return need.location;
  }

  if (!hasCoordinates(need)) {
    return need?.location || 'Assigned site';
  }

  const lat = Number(need.location_coords.lat);
  const lng = Number(need.location_coords.lng);
  if (Math.abs(lat - 11.4268) < 0.02 && Math.abs(lng - 78.1313) < 0.02) {
    return 'Gurusamipalayam, Rasipuram, Namakkal, Tamil Nadu';
  }

  return 'Pinned field location';
}

function getNeedDisplayTitle(need) {
  const title = need?.title || '';
  const locationName = getLocationDisplayName(need);

  if (isGpsLabel(need?.location) || /\bin GPS\s+-?\d/i.test(title)) {
    const category = String(need?.category || 'community').replace(/_/g, ' ');
    return `${category.charAt(0).toUpperCase()}${category.slice(1)} need at ${locationName}`;
  }

  return title || `Community need in ${locationName}`;
}

function buildAssignmentTask({ need, notes, scheduledDate }) {
  const lines = [];
  const locationName = getLocationDisplayName(need);

  if (notes) {
    lines.push(notes.trim());
  } else {
    lines.push(`Please handle this community need: ${getNeedDisplayTitle(need)}`);
  }

  if (locationName) {
    lines.push(`Location: ${locationName}`);
  }

  if (need?.category) {
    lines.push(`Category: ${String(need.category).replace(/_/g, ' ')}`);
  }

  if (need?.urgency_level) {
    lines.push(`Urgency: ${need.urgency_level}`);
  }

  if (scheduledDate) {
    lines.push(`Scheduled date: ${scheduledDate}`);
  }

  return lines.join('\n');
}

export default function DispatchModal({ open, onClose, onSaved, need, volunteers = [] }) {
  const todayISO = new Date().toISOString().split('T')[0];
  const [selected, setSelected] = useState([]);
  const [scheduledDate, setScheduledDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingAI, setLoadingAI] = useState(false);

  const toggleVolunteer = (vol) => {
    setSelected(s => s.find(v => v.id === vol.id) ? s.filter(v => v.id !== vol.id) : [...s, vol]);
  };

  const getAISuggestions = async () => {
    setLoadingAI(true);
    const res = await servexApi.integrations.Core.InvokeLLM({
      prompt: `You are an NGO coordinator AI. Given this community need, recommend up to 3 best-fit volunteers from the list.

NEED: ${need?.title} | Category: ${need?.category} | Urgency: ${need?.urgency_level} | Location: ${need?.location}

VOLUNTEERS:
${volunteers.map(v => `- ID: ${v.id}, Name: ${v.full_name}, Skills: ${(v.skills || []).join(', ')}, Location: ${v.location}, Status: ${v.status}`).join('\n')}

Return a JSON array of recommended volunteer IDs (strings).`,
      response_json_schema: {
        type: 'object',
        properties: { recommended_ids: { type: 'array', items: { type: 'string' } } }
      }
    });
    setAiSuggestions(res.recommended_ids || []);
    setLoadingAI(false);
  };

  const handleDispatch = async () => {
    setSaving(true);

    try {
      const task = buildAssignmentTask({ need, notes, scheduledDate });
      const priority = mapUrgencyToPriority(need?.urgency_level);
      const displayNeedTitle = getNeedDisplayTitle(need);

      // Step 1: Create the dispatch record and update need status â€” always succeeds.
      const dispatch = await servexApi.entities.Dispatch.create({
        need_id: need.id,
        need_title: need.title,
        volunteer_ids: selected.map((v) => v.id),
        volunteer_names: selected.map((v) => v.full_name),
        status: 'active',
        scheduled_date: scheduledDate || null,
        notes,
      });

      await servexApi.entities.CommunityNeed.update(need.id, { status: 'assigned' });

      // Step 2: Try to send WhatsApp notifications â€” best effort, non-blocking.
      const whatsappResults = await Promise.allSettled(
        selected.map(async (volunteer) => {
          if (!String(volunteer.phone || '').trim()) {
            throw new Error('missing_whatsapp_phone');
          }

          await servexApi.integrations.Volunteers.assignChatbotTask({
            volunteerId: volunteer.id,
            need_id: need.id,
            need_title: displayNeedTitle,
            task,
            priority,
            due_date: scheduledDate || '',
            create_dispatch: false,
          });

          return volunteer;
        })
      );

      const sentCount = whatsappResults.filter((r) => r.status === 'fulfilled').length;
      const failedVolunteers = whatsappResults
        .map((r, i) => ({ r, vol: selected[i] }))
        .filter(({ r }) => r.status === 'rejected')
        .map(({ vol }) => vol.full_name);

      if (failedVolunteers.length > 0 && sentCount === 0) {
        toast({
          title: 'Dispatch created â€” WhatsApp notification pending',
          description: `Dispatch record saved for ${selected.length} volunteer(s). WhatsApp send failed (check phone numbers or Meta API setup). Volunteers can still be notified manually.`,
        });
      } else if (failedVolunteers.length > 0) {
        toast({
          title: 'Dispatch created with partial WhatsApp delivery',
          description: `Sent to ${sentCount} volunteer(s). WhatsApp failed for: ${failedVolunteers.join(', ')}. Dispatch record saved.`,
        });
      } else {
        toast({
          title: 'Dispatch created and WhatsApp sent',
          description: `Assignment dispatched to ${sentCount} volunteer(s) via WhatsApp.`,
        });
      }

      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: 'Dispatch failed',
        description: error?.message || 'Unable to create dispatch. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const availableVols = volunteers.filter(v => v.status !== 'unavailable');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-jakarta">Dispatch Volunteers</DialogTitle>
        </DialogHeader>

        {need && (
          <div className="bg-accent rounded-lg p-3 mb-2">
            <p className="text-xs font-medium text-accent-foreground/70 mb-0.5">Need</p>
            <p className="text-sm font-semibold text-foreground">{need.title}</p>
            <p className="text-xs text-muted-foreground">{need.location} - {need.urgency_level}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Select Volunteers ({selected.length} selected)</Label>
            <Button variant="outline" size="sm" onClick={getAISuggestions} disabled={loadingAI} className="gap-2 text-primary border-primary/30 text-xs">
              {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI Suggest
            </Button>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto">
            {availableVols.map(vol => {
              const isSuggested = aiSuggestions.includes(vol.id);
              const isSelected = selected.find(v => v.id === vol.id);
              return (
                <div
                  key={vol.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
                    ${isSelected ? 'border-primary bg-accent' : 'border-border hover:bg-secondary/50'}
                    ${isSuggested ? 'ring-1 ring-primary/40' : ''}
                  `}
                  onClick={() => toggleVolunteer(vol)}
                >
                  <Checkbox checked={!!isSelected} readOnly />
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{vol.full_name?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      {vol.full_name}
                      {isSuggested && <span className="text-xs text-primary font-medium">* AI pick</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{(vol.skills || []).join(', ') || 'No skills listed'}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <Label>Scheduled Date</Label>
            <Input type="date" className="mt-1" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <Label>Dispatch Notes</Label>
            <Textarea className="mt-1" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instructions, context, or special notes..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDispatch} disabled={saving || selected.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Dispatch {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

