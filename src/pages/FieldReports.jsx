import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { servexApi } from '@/api/servexClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Plus, Loader2, Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function FieldReports() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reporter_name: '', raw_text: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['field-reports'],
    queryFn: () => servexApi.entities.FieldReport.list('-created_date', 100),
  });

  const handleSubmit = async () => {
    setSaving(true);
    await servexApi.entities.FieldReport.create({ ...form, processed: false, extracted_needs: 0 });
    qc.invalidateQueries(['field-reports']);
    setForm({ reporter_name: '', raw_text: '', location: '' });
    setSaving(false);
    setShowForm(false);
  };

  const processReport = async (report) => {
    setProcessing(report.id);
    const res = await servexApi.integrations.Core.InvokeLLM({
      prompt: `You are an NGO coordinator AI. Extract all community needs from this field report.

Field Report: "${report.raw_text}"
Location context: "${report.location}"

For each distinct need identified, provide structured data. Return JSON.`,
      response_json_schema: {
        type: 'object',
        properties: {
          analysis: { type: 'string' },
          needs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                category: { type: 'string' },
                urgency_level: { type: 'string' },
                urgency_score: { type: 'number' },
                beneficiaries_count: { type: 'number' },
                description: { type: 'string' },
              }
            }
          }
        }
      }
    });

    // Create needs from extraction
    for (const need of (res.needs || [])) {
      await servexApi.entities.CommunityNeed.create({
        ...need,
        location: report.location,
        source: 'field_report',
        status: 'unaddressed',
        raw_input: report.raw_text,
        ai_summary: res.analysis,
      });
    }

    await servexApi.entities.FieldReport.update(report.id, {
      processed: true,
      extracted_needs: (res.needs || []).length,
      ai_analysis: res.analysis,
    });

    qc.invalidateQueries(['field-reports', 'needs']);
    setProcessing(null);
  };

  const handleDelete = async (id) => {
    await servexApi.entities.FieldReport.delete(id);
    qc.invalidateQueries(['field-reports']);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-jakarta text-foreground">Field Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Paste raw field notes - AI extracts structured needs automatically</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> New Report
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-32 bg-card rounded-xl border animate-pulse" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No field reports yet</p>
          <p className="text-sm mt-1">Submit a field report to begin AI-powered needs extraction.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <div key={report.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {report.reporter_name && <span className="font-semibold text-foreground text-sm">{report.reporter_name}</span>}
                    <span className="text-xs text-muted-foreground">
                      {report.created_date && format(new Date(report.created_date), 'MMM d, yyyy - HH:mm')}
                    </span>
                    {report.location && <span className="text-xs text-muted-foreground">- {report.location}</span>}
                    {report.processed ? (
                      <span className="flex items-center gap-1 text-xs text-servex-navy bg-servex-periwinkle/55 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Processed - {report.extracted_needs} needs extracted
                      </span>
                    ) : (
                      <span className="text-xs bg-servex-blush text-servex-navy border border-servex-periwinkle/70 px-2 py-0.5 rounded-full">Pending</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 mt-2">{report.raw_text}</p>
                  {report.ai_analysis && (
                    <div className="mt-3 bg-accent rounded-lg p-3">
                      <p className="text-xs font-medium text-accent-foreground/70 mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Analysis</p>
                      <p className="text-xs text-accent-foreground">{report.ai_analysis}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  {!report.processed && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => processReport(report)}
                      disabled={processing === report.id}
                      className="gap-1.5 text-primary border-primary/30 w-full sm:w-auto"
                    >
                      {processing === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Extract Needs
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(report.id)} className="text-muted-foreground hover:text-destructive w-full sm:w-auto">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-jakarta">New Field Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Reporter Name</Label>
                <Input className="mt-1" value={form.reporter_name} onChange={e => setForm(f => ({ ...f, reporter_name: e.target.value }))} placeholder="Field agent name" />
              </div>
              <div>
                <Label>Location</Label>
                <Input className="mt-1" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Area / neighborhood" />
              </div>
            </div>
            <div>
              <Label>Field Notes / Message *</Label>
              <Textarea
                className="mt-1 min-h-[140px]"
                placeholder="Paste WhatsApp messages, voice note transcripts, or written field observations here..."
                value={form.raw_text}
                onChange={e => setForm(f => ({ ...f, raw_text: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.raw_text}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
