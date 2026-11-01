import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import classNames from 'classnames';
import { useLocation, useOutlet } from 'react-router-dom';
import './index.scss';

const EASE_OUT = [0.4, 0, 0.2, 1] as const;

interface AnimatedOutletProps {
  className?: string;
}

export default function AnimatedOutlet({ className }: AnimatedOutletProps) {
  const location = useLocation();
  const outlet = useOutlet();
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0.12 : 0.22;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className={classNames('ips-page-transition', className)}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration, ease: EASE_OUT }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
