import { motion } from 'framer-motion';

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', trend }) {
  const colors = {
    blue: 'bg-servex-periwinkle/60 text-servex-navy',
    green: 'bg-servex-blush text-servex-navy border border-servex-periwinkle/60',
    orange: 'bg-servex-indigo/20 text-servex-navy',
    red: 'bg-servex-navy text-servex-blush',
    purple: 'bg-servex-indigo/35 text-servex-navy',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend >= 0 ? 'bg-servex-periwinkle/45 text-servex-navy' : 'bg-servex-blush text-servex-navy border border-servex-indigo/30'
          }`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <div className="text-3xl font-bold font-jakarta text-foreground">{value}</div>
        <div className="text-sm font-medium text-foreground mt-0.5">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
    </motion.div>
  );
}
