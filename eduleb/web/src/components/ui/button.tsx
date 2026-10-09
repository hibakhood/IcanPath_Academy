import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-amber-600 disabled:pointer-events-none disabled:opacity-50', {
 variants: {
  variant: {default:'bg-[#0f8a83] text-white hover:bg-[#0d6f6a]',outline:'border border-[#a9e8df] bg-white text-[#0d6f6a] hover:bg-[#d9f5ef]'},
  size: {default:'px-5 py-3',sm:'px-3 py-2'}
 },defaultVariants:{variant:'default',size:'default'}
});
export function Button({className,variant,size,asChild=false,...props}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & {asChild?:boolean}) {
 const Component=asChild?Slot:'button';
 return <Component data-slot="button" className={cn(buttonVariants({variant,size,className}))} {...props}/>;
}
