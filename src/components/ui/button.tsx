import * as React from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    // Base styles with rounded-md (8px radius), keyboard-first focus states
    const baseStyles = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 px-4 py-2';
    
    const variantStyles = {
      // Default zinc button
      default: 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-900',
      // Primary amber button with subtle border for depth
      primary: 'bg-amber-600 text-white hover:bg-amber-700 border border-amber-700 focus-visible:ring-amber-600',
      // Outline button with zinc border
      outline: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50',
      // Ghost button for subtle actions
      ghost: 'text-zinc-900 hover:bg-zinc-100',
      // Danger button for destructive actions
      danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-700 focus-visible:ring-red-600',
    };

    return (
      <button
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
