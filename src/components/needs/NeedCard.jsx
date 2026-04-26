import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Calendar, Radio } from 'lucide-react';
import { format } from 'date-fns';

const urgencyConfig = {
  critical: { label: 'Critical', className: 'bg-servex-navy text-servex-blush border-servex-navy' },
  high: { label: 'High', className: 'bg-servex-indigo text-servex-blush border-servex-indigo' },
  medium: { label: 'Medium', className: 'bg-servex-periwinkle text-servex-navy border-servex-indigo/50' },
  low: { label: 'Low', className: 'bg-servex-blush text-servex-navy border-servex-periwinkle' },
};

const statusConfig = {
  unaddressed: { label: 'Unaddressed', className: 'bg-servex-blush text-servex-navy border border-servex-periwinkle/70' },
  assigned: { label: 'Assigned', className: 'bg-servex-periwinkle/55 text-servex-navy' },
  in_progress: { label: 'In Progress', className: 'bg-servex-indigo text-servex-blush' },
  resolved: { label: 'Resolved', className: 'bg-servex-navy text-servex-blush' },
};

const categoryLabels = {
  food: 'Food',
  medical: 'Medical',
  shelter: 'Shelter',
  education: 'Education',
  mental_health: 'Mental Health',
  elderly_care: 'Elderly Care',
  childcare: 'Childcare',
  transportation: 'Transport',
  other: 'Other',
};

export default function NeedCard({ need, onClick }) {
  const urg = urgencyConfig[need.urgency_level] || urgencyConfig.medium;
  const st = statusConfig[need.status] || statusConfig.unaddressed;
  const isSurveyNeed = need.source === 'survey' || need.source_ref_type === 'survex_survey';

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          {need.photo_url && (
            <div className="mb-3 rounded-lg overflow-hidden h-32 bg-secondary/50">
              <img 
                src={`${window.location.protocol}//${window.location.hostname}:4000${need.photo_url}`} 
                alt={need.title}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            </div>
          )}
          <h4 className="font-semibold text-foreground text-sm leading-snug group-hover:text-primary transition-colors">
            {need.title}
          </h4>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{need.location}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Badge variant="outline" className={`text-xs ${urg.className}`}>{urg.label}</Badge>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}>{st.label}</span>
          {isSurveyNeed && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
              <Radio className="w-3 h-3" /> Survey
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
        <span>{categoryLabels[need.category] || need.category}</span>
        {need.beneficiaries_count && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {need.beneficiaries_count}
          </span>
        )}
        {need.created_date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(need.created_date), 'MMM d')}
          </span>
        )}
      </div>

      {need.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{need.description}</p>
      )}

      {need.reported_by_name && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Reported by <span className="font-medium text-foreground">{need.reported_by_name}</span>
        </p>
      )}

      {need.urgency_score && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${need.urgency_score}%` }}
            />
          </div>
          <span className="text-xs font-medium text-foreground">{need.urgency_score}/100</span>
        </div>
      )}
    </div>
  );
}
