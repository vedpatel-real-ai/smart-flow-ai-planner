-- This version originally repeated the bootstrap schema. Keep its version in the
-- ledger; the only additional table was time_blocks. Both historical shapes
-- converge in the forward migration.
-- Create time_blocks table
CREATE TABLE public.time_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own time_blocks" ON public.time_blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time_blocks" ON public.time_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time_blocks" ON public.time_blocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own time_blocks" ON public.time_blocks FOR DELETE USING (auth.uid() = user_id);
