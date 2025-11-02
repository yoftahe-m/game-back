import multer from 'multer';
import { Router } from 'express';

import { loginUser, logoutUser, changeName, refreshToken, registerUser, changeProfilePic, changeProfile } from '../controllers/user.controller';
import authorizer from '../middlewares/authorizer';
import handleValidation from '../validators/handleValidation';
import { validateChangeName, validateRefreshToken } from '../validators/user';

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true); // Accept the file
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);

router.post('/refreshToken', validateRefreshToken, handleValidation, refreshToken);

router.post('/changeName', authorizer, validateChangeName, handleValidation, changeName);

router.post('/changeProfilePic', authorizer, upload.single('image'), changeProfilePic);

router.post('/changeProfile', authorizer, upload.single('image'), changeProfile);

export default router;
