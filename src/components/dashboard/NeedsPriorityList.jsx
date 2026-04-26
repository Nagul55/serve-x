import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, MapPin, Users } from 'lucide-react';
import { motion } from 'framer-motion';

const urgencyConfig = {
  critical: { label: 'Critical', className: 'bg-servex-navy text-servex-blush border-servex-navy' },
  high: { label: 'High', className: 'bg-servex-indigo text-servex-blush border-servex-indigo' },
  medium: { label: 'Medium', className: 'bg-servex-periwinkle text-servex-navy border-servex-indigo/50' },
  low: { label: 'Low', className: 'bg-servex-blush text-servex-navy border-servex-periwinkle' },
};

export default function NeedsPriorityList({ needs = [], highlightedId = null }) {
  const sorted = [...needs]
    .filter(n => n.status !== 'resolved')
    .sort((a, b) => (b.urgency_score || 0) - (a.urgency_score || 0))
    .slice(0, 10); // Show more to ensure the clicked one is likely visible

  return (
    <div className="bg-card/95 rounded-xl border border-servex-periwinkle/70 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold font-jakarta text-foreground text-lg">Top Priority Needs</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/needs" className="flex items-center gap-1 text-primary text-xs font-bold">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No active needs found.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((need, i) => {
            const urg = urgencyConfig[need.urgency_level] || urgencyConfig.medium;
            const isHighlighted = highlightedId === need.id;
            return (
              <motion.div
                id={`need-card-${need.id}`}
                key={need.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-500 border ${
                  isHighlighted 
                    ? 'bg-servex-periwinkle/40 border-primary shadow-md scale-[1.02] z-10' 
                    : 'hover:bg-servex-blush/70 border-transparent'
                }`}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-servex-periwinkle/40 flex items-center justify-center mt-0.5">
                  <span className="text-xs font-bold text-servex-navy">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{need.title}</span>
                    <Badge variant="outline" className={`text-xs ${urg.className}`}>{urg.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {need.location}
                    </span>
                    {need.beneficiaries_count && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> {need.beneficiaries_count} affected
                      </span>
                    )}
                  </div>
                </div>
                {need.urgency_score && (
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-bold text-foreground">{need.urgency_score}</div>
                    <div className="text-xs text-muted-foreground">score</div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
