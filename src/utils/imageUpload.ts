import { v4 as uuidv4 } from "uuid";
import supabase from "@/config/supabase";

export default async (
  userId: string,
  bucketName: string,
  files: Express.Multer.File[]
) => {
  const uploadedImages: string[] = [];

  for (const file of files) {
    const id = uuidv4();
    const filePath = `userId/${id}.${file.mimetype}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) throw new Error(`File upload failed: ${error.message}`);

    const publicURL = supabase.storage.from(bucketName).getPublicUrl(filePath);
    uploadedImages.push(publicURL.data.publicUrl);
  }

  return uploadedImages;
};
