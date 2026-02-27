import asyncHandler from "express-async-handler";
import SharedWork from "../models/sharedWorkModel.js";
import Work from "../models/workModel.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";


/*
SET PASSWORD
*/
export const setSharePassword = asyncHandler(async (req, res) => {

    const { workId, password } = req.body;
    const user = req.user;

    if (!password || password.length < 6)
        throw new Error("Password min 6");

    const work = await Work.findById(workId);
    if (!work) throw new Error("Work not found");

    if (work.id_client.toString() !== user._id.toString())
        throw new Error("Unauthorized");

    let share = await SharedWork.findOne({ id_work: workId });

    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");

    /* ⭐ detect BEFORE overwrite */
    const alreadyHadPassword = !!share?.password_hash;

    if (share) {
        share.password_hash = hash;
        share.sha256_string = token;
        share.end_date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await share.save();
    } else {
        share = await SharedWork.create({
            id_work: workId,
            password_hash: hash,
            sha256_string: token,
            end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
    }

    res.json({
        message: "Password set",
        shareId: share.sha256_string,
        shareUrl: `${process.env.FRONTEND_URL}/shared/${share.sha256_string}`,
        passwordAlreadySet: alreadyHadPassword   // ⭐ FLAG
    });
});


/*
GET SHARE LINK
*/
export const createShareLink = asyncHandler(async (req, res) => {

    const { workId } = req.body;

    const share = await SharedWork.findOne({ id_work: workId });
    if (!share) throw new Error("Set password first");

    res.json({
        shareUrl: `${process.env.FRONTEND_URL}/shared/${share.sha256_string}`
    });

});


/*
ACCESS SHARED WORK (LINK)
*/
export const getSharedWork = asyncHandler(async (req, res) => {

    const { shareId } = req.params;
    const { password } = req.body;

    const sharedWork = await SharedWork.findOne({
        sha256_string: shareId
    }).populate({
        path: "id_work",
        populate: { path: "id_certificate" }
    });

    if (!sharedWork) throw new Error("Share not found");

    if (sharedWork.end_date < new Date())
        throw new Error("Link expired");

    if (sharedWork.password_hash) {
        if (!password) throw new Error("Password required");

        const ok = await bcrypt.compare(password, sharedWork.password_hash);
        if (!ok) throw new Error("Invalid password");
    }

    const work = sharedWork.id_work;

    const fileUrl = await generateSignedUrl(work.id_file);
    const certUrl = await generateSignedUrl(work.id_certificate.id_file);
    const otsUrl = work.id_ots ? await generateSignedUrl(work.id_ots) : null;

    res.json({
        success: true,
        data: {
            title: work.title,
            file_name: work.file_name,
            downloadUrl: fileUrl,
            certificateUrl: certUrl,
            otsUrl
        }
    });

});


/*
ACCESS BY REFERENCE (FIXED)
*/
export const accessByReference = asyncHandler(async (req, res) => {

    const { reference, password } = req.body;

    if (!reference) throw new Error("Reference required");

    const work = await Work.findOne({ displayed_ID: reference })
        .populate("id_certificate");

    if (!work) throw new Error("Work not found");

    const share = await SharedWork.findOne({ id_work: work._id });
    if (!share) throw new Error("No password set");

    if (share.end_date < new Date())
        throw new Error("Link expired");

    if (!password) throw new Error("Password required");

    const valid = await bcrypt.compare(password, share.password_hash);
    if (!valid) throw new Error("Invalid password");

    const fileUrl = await generateSignedUrl(work.id_file);
    const certUrl = await generateSignedUrl(work.id_certificate.id_file);
    const otsUrl = work.id_ots ? await generateSignedUrl(work.id_ots) : null;

    res.json({
        success: true,
        data: {
            title: work.title,
            file_name: work.file_name,
            downloadUrl: fileUrl,
            certificateUrl: certUrl,
            otsUrl
        }
    });

});


/*
LIST SHARES
*/
export const listWorkShares = asyncHandler(async (req, res) => {

    const { workId } = req.params;
    const user = req.user;

    const work = await Work.findById(workId);
    if (!work || work.id_client.toString() !== user._id.toString())
        throw new Error("Unauthorized");

    const shares = await SharedWork.find({
        id_work: workId,
        end_date: { $gt: new Date() }
    });

    res.json({
        shares: shares.map(s => ({
            id: s._id,
            shareUrl: `${process.env.FRONTEND_URL}/shared/${s.sha256_string}`,
            expiryDate: s.end_date,
            passwordProtected: !!s.password_hash
        }))
    });

});


/*
DELETE SHARE
*/
export const deleteShare = asyncHandler(async (req, res) => {

    const { shareId } = req.params;
    const user = req.user;

    const share = await SharedWork.findById(shareId).populate("id_work");
    if (!share) throw new Error("Share not found");

    if (share.id_work.id_client.toString() !== user._id.toString())
        throw new Error("Unauthorized");

    await SharedWork.findByIdAndDelete(shareId);

    res.json({ message: "Share deleted" });
});