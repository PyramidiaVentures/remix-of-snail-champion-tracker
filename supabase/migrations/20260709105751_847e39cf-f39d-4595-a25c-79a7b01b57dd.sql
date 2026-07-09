
CREATE POLICY "field-photos authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'field-photos');

CREATE POLICY "field-photos authenticated insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'field-photos');

CREATE POLICY "field-photos authenticated update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'field-photos')
WITH CHECK (bucket_id = 'field-photos');

CREATE POLICY "field-photos authenticated delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'field-photos');
