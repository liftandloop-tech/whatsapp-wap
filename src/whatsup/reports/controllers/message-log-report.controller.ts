import { Controller, Get, Query } from "@nestjs/common";
import { MessageLogReportService } from "../services/message-log-report.service";
import { MessageLogReportRequestDto } from "../dto/message-log-report-request.dto";


@Controller("whatsapp/message-logs-report")
export class MessageLogReportController {

    constructor(
        private readonly messageLogReportService: MessageLogReportService
    ) { }


    @Get()
    getMessageLogsReport(@Query() payload: MessageLogReportRequestDto) {
        return this.messageLogReportService.getMessageLogsReport(payload);
    }
}