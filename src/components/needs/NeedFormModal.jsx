import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { servexApi } from '@/api/servexClient';

const CATEGORIES = ['food', 'medical', 'shelter', 'education', 'mental_health', 'elderly_care', 'childcare', 'transportation', 'other'];
const URGENCY = ['critical', 'high', 'medium', 'low'];
const SOURCES = ['field_report', 'whatsapp', 'survey', 'verbal', 'other'];

export default function NeedFormModal({ open, onClose, onSaved, initial = null }) {
  const [form, setForm] = useState(initial || {
    title: '', description: '', location: '', category: 'food',
    urgency_level: 'medium', status: 'unaddressed', source: 'field_report',
    beneficiaries_count: '', notes: '', raw_input: ''
  });
  const [saving, setSaving] = useState(false);
  const [analyzingAI, setAnalyzingAI] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const analyzeWithAI = async () => {
    if (!form.raw_input && !form.description) return;
    setAnalyzingAI(true);
    const res = await servexApi.integrations.Core.InvokeLLM({
      prompt: `You are an NGO coordinator AI. Analyze this community need report and return structured data.
Report: "${form.raw_input || form.description}"
Location hint: "${form.location}"

Return JSON with: title (short), urgency_level (critical/high/medium/low), urgency_score (0-100), category (food/medical/shelter/education/mental_health/elderly_care/childcare/transportation/other), beneficiaries_count (number estimate), ai_summary (2 sentences: what the need is and recommended action).`,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          urgency_level: { type: 'string' },
          urgency_score: { type: 'number' },
          category: { type: 'string' },
          beneficiaries_count: { type: 'number' },
          ai_summary: { type: 'string' },
        }
      }
    });
    setForm(f => ({
      ...f,
      title: res.title || f.title,
      urgency_level: res.urgency_level || f.urgency_level,
      urgency_score: res.urgency_score,
      category: res.category || f.category,
      beneficiaries_count: res.beneficiaries_count || f.beneficiaries_count,
      ai_summary: res.ai_summary,
    }));
    setAnalyzingAI(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, beneficiaries_count: Number(form.beneficiaries_count) || undefined };
    if (initial?.id) {
      await servexApi.entities.CommunityNeed.update(initial.id, data);
    } else {
      await servexApi.entities.CommunityNeed.create(data);
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100%-1rem)] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-jakarta">{initial ? 'Edit Need' : 'Log Community Need'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Raw Field Notes / WhatsApp Message</Label>
            <Textarea
              className="mt-1 min-h-[80px]"
              placeholder="Paste raw notes here - AI will extract structured data..."
              value={form.raw_input}
              onChange={e => set('raw_input', e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-2 text-primary border-primary/30"
              onClick={analyzeWithAI}
              disabled={analyzingAI || (!form.raw_input && !form.description)}
            >
              {analyzingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Analyze with AI
            </Button>
          </div>

          {form.ai_summary && (
            <div className="bg-accent rounded-lg p-3 text-sm text-accent-foreground border border-primary/20">
              <p className="font-medium text-xs mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Analysis</p>
              {form.ai_summary}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Title *</Label>
              <Input className="mt-1" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Short description of the need" />
            </div>
            <div>
              <Label>Location *</Label>
              <Input className="mt-1" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Neighborhood / area" />
            </div>
            <div>
              <Label>Beneficiaries</Label>
              <Input className="mt-1" type="number" value={form.beneficiaries_count} onChange={e => set('beneficiaries_count', e.target.value)} placeholder="Est. people affected" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urgency Level</Label>
              <Select value={form.urgency_level} onValueChange={v => set('urgency_level', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCY.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['unaddressed', 'assigned', 'in_progress', 'resolved'].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source} onValueChange={v => set('source', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea className="mt-1" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Additional details..." />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title || !form.location}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {initial ? 'Update' : 'Save Need'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

