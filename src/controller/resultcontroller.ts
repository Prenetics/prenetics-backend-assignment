import { Request, Response } from 'express';
import moment = require('moment');
import { getManager, getRepository } from 'typeorm';
import { logger } from '../component/logger';
import { search } from '../component/search';
import { Organisation } from '../entity/organisation';
import { Profile } from '../entity/profile';
import { Result } from '../entity/result';

export const resultController = new class {

    getResults = async (request: Request, response: Response) => {
        request.checkParams('org', 'org is not valid').isUUID();
        const errors = request.validationErrors();
        if (errors) {
            response.status(400).json(errors);
            return;
        }
        const { org } = request.params;
        const {  pageNum, pageLimit, activateDate, resultDate, patientName, patientId } = request.query;
        try {
            const manager = getManager();
            const organisation = await manager.findOne(Organisation, {
                where: {
                    organisationId: org,
                }
            });
            if (!organisation) {
                response.status(404).json({ msg: 'Organisation not found' });
            } else {
                let result = await search(
                    manager,
                    organisation,
                    request.params,
                );
                const pagination = (pageNum: any, pageLimit: any) => {
                    const startIndex = (+pageNum - 1) * +pageLimit;
                    const endIndex = +pageNum * +pageLimit;

                    result.data = result.data.slice(startIndex, endIndex);
                    result.included = result.included.slice(startIndex, endIndex);
                    // result.meta.total = pageLimit
                }

                const filter = () => {
                    if (patientName){
                        result.included = result.included.filter(data => data.attributes.name === patientName)
                        let patientIdData = result.included[0]?.id
                        result.data = result.data.filter(data => data.relationships.profile.data.id === patientIdData)
                    }

                    if(activateDate){
                        result.data = result.data.filter(data => moment(data.attributes.activateTime).format("MM/DD/YYYY") === moment(activateDate).format("MM/DD/YYYY"))
                        if(!result.data.length){
                            result.included = []
                        }
                        for(let i = 0; i < result.data.length; i++){
                            let patientIdData = result.data[i].relationships.profile.data.id
                            result.included = result.included.filter(data => data.id === patientIdData)
                        }
                    }
                    if(resultDate){
                        result.data = result.data.filter(data => moment(data.attributes.resultTime).format("MM/DD/YYYY") === moment(resultDate).format("MM/DD/YYYY"))
                        if(!result.data.length){
                            result.included = []
                        }
                        for(let i = 0; i < result.data.length; i++){
                            let patientId = result.data[i].relationships.profile.data.id
                            result.included = result.included.filter(data => data.id === patientId)
                        }
                    }

                    if(patientId){
                        result.included = result.included.filter(data => data.id === patientId)
                        result.data = result.data.filter(data => data.relationships.profile.data.id === patientId)
                    }
                }

                filter();
                pagination(pageNum ? pageNum : 1, pageLimit ? pageLimit : 5);
                
                response.status(200).json(result);
            }
        } catch (err) {
            logger.error(err.message);
            response.status(500).json({ msg: 'Something went wrong', err: err.message });
        }
    }

    getProfileResult = async (request: Request, response: Response) => {
        request.checkParams('org', 'org is not valid').isUUID();
        request.checkParams('profileId', 'profileId is not valid').isUUID();
        request.checkParams('sampleId', 'sampleId is not valid').isString().notEmpty();
        const errors = request.validationErrors();
        if (errors) {
            response.status(400).json(errors);
            return;
        }

        const { org, profileId, sampleId } = request.params;
        try {
            const resultEnt = await getManager()
                .createQueryBuilder()
                .select('result')
                .from(Result, 'result')
                .innerJoin(
                    'result.profile',
                    'profile',
                    'profile.profileId = :profileId',
                    {
                        profileId,
                    }
                )
                .innerJoin(
                    'profile.organisation',
                    'organisation',
                    'organisation.organisationId = :organisationId',
                    {
                        organisationId: org,
                    }
                )
                .where(
                    'result.sampleId = :sampleId',
                    {
                        sampleId,
                    }
                )
                .getOne();
            if (resultEnt) {
                const { activateTime, resultTime, result, type: resultType, sampleId, resultId: id, } = resultEnt;
                response.status(200).json({
                    data: {
                        id,
                        type: 'sample',
                        attributes: {
                            result,
                            sampleId,
                            resultType,
                            activateTime,
                            resultTime,
                        },
                    },
                });
            } else {
                response.status(404).json({ msg: 'Result not found' });
            }
        } catch (err) {
            logger.error(err.message);
            response.status(500).json({ msg: 'Something went wrong' });
        }
    }

    addResult = async (request: Request, response: Response) => {
        request.checkParams('org', 'org is not valid').isUUID();
        request.checkParams('profileId', 'profileId is not valid').isUUID();
        request.checkBody('data.type', 'type is not valid').equals('sample');
        request.checkBody('data.attributes.sampleId', 'sampleId is not valid').notEmpty();
        request.checkBody('data.attributes.resultType', 'resultType is not valid').notEmpty();
        const errors = request.validationErrors();
        if (errors) {
            response.status(400).json(errors);
            return;
        }

        try {
            const { org, profileId } = request.params;
            const profile = await getManager()
                .createQueryBuilder()
                .select('profile')
                .from(Profile, 'profile')
                .innerJoin(
                    'profile.organisation',
                    'organisation',
                    'organisation.organisationId = :organisationId',
                    {
                        organisationId: org,
                    }
                )
                .where(
                    'profile.profileId = :profileId',
                    {
                        profileId,
                    }
                )
                .getOne();
            if (!profile) {
                response.status(404).json({ msg: 'Profile not found' });
                return;
            }
            const { sampleId, resultType } = request.body.data.attributes;
            const repo = getRepository(Result);
            const resultEnt = await repo.save(repo.create({
                sampleId,
                type: resultType,
                profile,
            }));
            const { activateTime, resultId: id, } = resultEnt;
            response.status(201).json({
                data: {
                    id,
                    type: 'sample',
                    attributes: {
                        sampleId,
                        resultType,
                        activateTime,
                    },
                },
            });
        } catch (err) {
            logger.error(err.message);
            response.status(500).json({ msg: 'Something went wrong' });
        }
    }

};
